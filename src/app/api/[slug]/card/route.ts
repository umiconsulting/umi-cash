import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatMXN } from '@/lib/currency';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { getTenant } from '@/lib/tenant';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await requireAuth()(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  // Verify token's tenantId matches this slug
  if (user.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const [card, rewardConfig] = await Promise.all([
    prisma.loyaltyCard.findUnique({
      where: { userId: user.sub },
      include: {
        visits: { orderBy: { scannedAt: 'desc' }, take: 5 },
        transactions: { orderBy: { createdAt: 'desc' }, take: 5 },
        user: true,
      },
    }),
    getActiveRewardConfig(tenant.id),
  ]);

  if (!card) return NextResponse.json({ error: 'Tarjeta no encontrada' }, { status: 404 });

  const { visitsRequired, rewardName, rewardDescription } = rewardConfigDefaults(rewardConfig);
  const progressPercent = Math.min(Math.round((card.visitsThisCycle / visitsRequired) * 100), 100);

  return NextResponse.json({
    cardId: card.id,
    cardNumber: card.cardNumber,
    customerName: card.user.name,
    tenantName: tenant.name,
    balanceCentavos: card.balanceCentavos,
    balanceMXN: formatMXN(card.balanceCentavos),
    totalVisits: card.totalVisits,
    visitsThisCycle: card.visitsThisCycle,
    visitsRequired,
    pendingRewards: card.pendingRewards,
    rewardName,
    rewardDescription,
    progressPercent,
    recentVisits: card.visits.map((v) => ({ id: v.id, scannedAt: v.scannedAt.toISOString() })),
    recentTransactions: card.transactions.map((t) => ({
      id: t.id, type: t.type, amountCentavos: t.amountCentavos,
      description: t.description, createdAt: t.createdAt.toISOString(),
    })),
  });
}
