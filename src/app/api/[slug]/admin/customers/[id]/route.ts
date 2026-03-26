import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatMXN } from '@/lib/currency';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { getTenant } from '@/lib/tenant';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const user = await requireAuth(['STAFF', 'ADMIN'])(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (user.tenantId !== tenant.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const [targetUser, rewardConfig] = await Promise.all([
    prisma.user.findFirst({
      where: { id: params.id, tenantId: tenant.id },
      include: {
        card: {
          include: {
            visits: { orderBy: { scannedAt: 'desc' }, take: 10 },
            transactions: { orderBy: { createdAt: 'desc' }, take: 10 },
          },
        },
      },
    }),
    getActiveRewardConfig(tenant.id),
  ]);

  if (!targetUser || !targetUser.card) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const { visitsRequired } = rewardConfigDefaults(rewardConfig);
  const card = targetUser.card;

  // LTV = sum of all PURCHASE transactions (negative amounts = money spent at the store)
  const ltvAgg = await prisma.transaction.aggregate({
    where: { cardId: card.id, type: 'PURCHASE' },
    _sum: { amountCentavos: true },
  });
  const ltvCentavos = Math.abs(ltvAgg._sum.amountCentavos ?? 0);

  // Total topped up = sum of all TOPUP transactions
  const topupAgg = await prisma.transaction.aggregate({
    where: { cardId: card.id, type: 'TOPUP' },
    _sum: { amountCentavos: true },
  });
  const totalTopupCentavos = topupAgg._sum.amountCentavos ?? 0;

  return NextResponse.json({
    id: targetUser.id, name: targetUser.name, phone: targetUser.phone, email: targetUser.email,
    cardNumber: card.cardNumber, cardId: card.id,
    balanceMXN: formatMXN(card.balanceCentavos), balanceCentavos: card.balanceCentavos,
    totalVisits: card.totalVisits, visitsThisCycle: card.visitsThisCycle,
    visitsRequired, pendingRewards: card.pendingRewards,
    lastVisit: card.visits[0]?.scannedAt?.toISOString() ?? null,
    createdAt: targetUser.createdAt.toISOString(),
    ltvCentavos, ltvMXN: formatMXN(ltvCentavos),
    totalTopupCentavos, totalTopupMXN: formatMXN(totalTopupCentavos),
    recentVisits: card.visits.map((v) => ({ id: v.id, scannedAt: v.scannedAt.toISOString() })),
    recentTransactions: card.transactions.map((t) => ({
      id: t.id, type: t.type, amountCentavos: t.amountCentavos,
      description: t.description, createdAt: t.createdAt.toISOString(),
    })),
  });
}
