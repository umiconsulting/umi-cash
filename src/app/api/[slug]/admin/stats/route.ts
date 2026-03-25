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

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [visitsToday, topupsToday, pendingRewards] = await Promise.all([
    prisma.visit.count({
      where: { card: { tenantId: tenant.id }, scannedAt: { gte: dayStart } },
    }),
    prisma.transaction.aggregate({
      where: {
        card: { tenantId: tenant.id },
        type: 'TOPUP',
        createdAt: { gte: dayStart },
      },
      _sum: { amountCentavos: true },
      _count: true,
    }),
    prisma.loyaltyCard.aggregate({
      where: { tenantId: tenant.id, pendingRewards: { gt: 0 } },
      _sum: { pendingRewards: true },
    }),
  ]);

  return NextResponse.json({
    visitsToday,
    topupsTodayCount: topupsToday._count,
    topupsTodayMXN: formatMXN(topupsToday._sum.amountCentavos ?? 0),
    pendingRewards: pendingRewards._sum.pendingRewards ?? 0,
  });
}
