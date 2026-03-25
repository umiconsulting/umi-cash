import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTenant } from '@/lib/tenant';
import { formatMXN } from '@/lib/currency';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const staff = await requireAuth(['STAFF', 'ADMIN'])(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (staff.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const now = new Date();

  // 30 days ago
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  // 8 weeks ago
  const eightWeeksAgo = new Date(now);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  eightWeeksAgo.setHours(0, 0, 0, 0);

  // Start of this month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    recentVisits,
    topCards,
    recentUsers,
    allCards,
    topupsThisMonth,
    rewardsThisMonth,
    activeCustomersLast30,
    totalCustomers,
  ] = await Promise.all([
    // All visits in last 30 days
    prisma.visit.findMany({
      where: {
        card: { tenantId: tenant.id },
        scannedAt: { gte: thirtyDaysAgo },
      },
      select: { scannedAt: true },
    }),

    // Top 10 cards by totalVisits
    prisma.loyaltyCard.findMany({
      where: { tenantId: tenant.id },
      orderBy: { totalVisits: 'desc' },
      take: 10,
      include: { user: { select: { id: true, name: true } } },
    }),

    // Users created in last 8 weeks
    prisma.user.findMany({
      where: {
        tenantId: tenant.id,
        role: 'CUSTOMER',
        createdAt: { gte: eightWeeksAgo },
      },
      select: { createdAt: true },
    }),

    // All cards for balance sum
    prisma.loyaltyCard.findMany({
      where: { tenantId: tenant.id },
      select: { balanceCentavos: true },
    }),

    // Topups this month
    prisma.transaction.aggregate({
      where: {
        card: { tenantId: tenant.id },
        type: 'TOPUP',
        createdAt: { gte: monthStart },
      },
      _sum: { amountCentavos: true },
    }),

    // Reward redemptions this month
    prisma.rewardRedemption.count({
      where: {
        card: { tenantId: tenant.id },
        redeemedAt: { gte: monthStart },
      },
    }),

    // Distinct customers who had a visit in last 30 days
    prisma.visit.findMany({
      where: {
        card: { tenantId: tenant.id },
        scannedAt: { gte: thirtyDaysAgo },
      },
      select: { cardId: true },
      distinct: ['cardId'],
    }),

    // Total customer count
    prisma.user.count({
      where: { tenantId: tenant.id, role: 'CUSTOMER' },
    }),
  ]);

  // --- visitsByDay: group by date string ---
  const visitCountByDay: Record<string, number> = {};
  for (const v of recentVisits) {
    const dateStr = v.scannedAt.toISOString().slice(0, 10);
    visitCountByDay[dateStr] = (visitCountByDay[dateStr] ?? 0) + 1;
  }

  // Fill in all 30 days (including zero-count days)
  const visitsByDay: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    visitsByDay.push({ date: dateStr, count: visitCountByDay[dateStr] ?? 0 });
  }

  // --- topCustomers ---
  const topCustomers = topCards.map((card) => ({
    id: card.userId,
    name: card.user?.name ?? 'Sin nombre',
    cardNumber: card.cardNumber,
    totalVisits: card.totalVisits,
    balanceMXN: formatMXN(card.balanceCentavos),
  }));

  // --- newCustomersByWeek: group by ISO week start (Monday) ---
  const SPANISH_MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Build week buckets: last 8 weeks, each week starts on Monday
  // Find the Monday of the current week
  const todayDow = now.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const daysToMonday = todayDow === 0 ? 6 : todayDow - 1;
  const thisWeekMonday = new Date(now);
  thisWeekMonday.setDate(now.getDate() - daysToMonday);
  thisWeekMonday.setHours(0, 0, 0, 0);

  const weekBuckets: { weekStart: Date; label: string }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(thisWeekMonday);
    weekStart.setDate(thisWeekMonday.getDate() - i * 7);
    const label = `${SPANISH_MONTH_ABBR[weekStart.getMonth()]} ${weekStart.getDate()}`;
    weekBuckets.push({ weekStart, label });
  }

  const newCustomersByWeek: { week: string; count: number }[] = weekBuckets.map(({ weekStart, label }, idx) => {
    const nextWeekStart = idx < weekBuckets.length - 1 ? weekBuckets[idx + 1].weekStart : new Date(now.getTime() + 86400000);
    const count = recentUsers.filter(
      (u) => u.createdAt >= weekStart && u.createdAt < nextWeekStart
    ).length;
    return { week: label, count };
  });

  // --- totalBalance ---
  const totalBalanceCentavos = allCards.reduce((sum, c) => sum + c.balanceCentavos, 0);

  // --- avgVisitsPerCustomer ---
  const avgVisitsPerCustomer =
    totalCustomers > 0
      ? Math.round((topCards.reduce((s, c) => s + c.totalVisits, 0) / totalCustomers) * 10) / 10
      : 0;

  // For avg we need all cards, not just top 10 — reuse allCards which has balanceCentavos
  // We need totalVisits from all cards for a true avg — query separately
  const allVisitsSums = await prisma.loyaltyCard.aggregate({
    where: { tenantId: tenant.id },
    _sum: { totalVisits: true },
  });
  const trueAvg =
    totalCustomers > 0
      ? Math.round(((allVisitsSums._sum.totalVisits ?? 0) / totalCustomers) * 10) / 10
      : 0;

  // --- retentionRate ---
  const retentionRate =
    totalCustomers > 0
      ? Math.round((activeCustomersLast30.length / totalCustomers) * 100)
      : 0;

  return NextResponse.json({
    visitsByDay,
    topCustomers,
    newCustomersByWeek,
    totalBalance: formatMXN(totalBalanceCentavos),
    topupsThisMonth: formatMXN(topupsThisMonth._sum.amountCentavos ?? 0),
    rewardsRedeemedThisMonth: rewardsThisMonth,
    avgVisitsPerCustomer: trueAvg,
    retentionRate,
  });
}
