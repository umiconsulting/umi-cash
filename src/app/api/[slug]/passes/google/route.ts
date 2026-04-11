import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateGoogleWalletURL, isGoogleWalletConfigured } from '@/lib/pass-google';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { DEFAULT_CUSTOMER_NAME } from '@/lib/constants';
import { getTenant } from '@/lib/tenant';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await requireAuth()(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (user.tenantId !== tenant.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  if (!isGoogleWalletConfigured()) {
    return NextResponse.json({
      error: 'Google Wallet no está configurado.',
      configured: false,
    }, { status: 503 });
  }

  const [card, rewardConfig] = await Promise.all([
    prisma.loyaltyCard.findUnique({ where: { userId: user.sub }, include: { user: true } }),
    getActiveRewardConfig(tenant.id),
  ]);

  if (!card) return NextResponse.json({ error: 'Tarjeta no encontrada' }, { status: 404 });

  const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);

  try {
    const saveUrl = await generateGoogleWalletURL({
      cardId: card.id,
      cardNumber: card.cardNumber,
      customerName: card.user.name || DEFAULT_CUSTOMER_NAME,
      balanceCentavos: card.balanceCentavos,
      visitsThisCycle: card.visitsThisCycle,
      visitsRequired,
      pendingRewards: card.pendingRewards,
      rewardName,
      totalVisits: card.totalVisits,
      memberSince: card.createdAt.toISOString(),
      tenantName: tenant.name,
      tenantSlug: params.slug,
      primaryColor: tenant.primaryColor,
    });

    if (!card.googlePassObjectId) {
      const objectId = `${process.env.GOOGLE_WALLET_ISSUER_ID}.card_${card.id}`;
      await prisma.loyaltyCard.update({ where: { id: card.id }, data: { googlePassObjectId: objectId } });
    }

    return NextResponse.json({ saveUrl });
  } catch (err) {
    console.error('[Google Pass]', err instanceof Error ? err.message : err);
    console.error('[Google Pass] Stack:', err instanceof Error ? err.stack : '');
    return NextResponse.json({ error: 'Error generando pase. Intenta de nuevo.' }, { status: 500 });
  }
}
