import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateApplePass, isAppleWalletConfigured } from '@/lib/pass-apple';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { DEFAULT_CUSTOMER_NAME } from '@/lib/constants';
import { getTenant } from '@/lib/tenant';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await requireAuth()(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (user.tenantId !== tenant.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  if (!isAppleWalletConfigured()) {
    return NextResponse.json({
      error: 'Apple Wallet no está configurado.',
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
    const { buffer, serial, authToken } = await generateApplePass({
      cardId: card.id,
      cardNumber: card.cardNumber,
      customerName: card.user.name || DEFAULT_CUSTOMER_NAME,
      balanceCentavos: card.balanceCentavos,
      visitsThisCycle: card.visitsThisCycle,
      visitsRequired,
      pendingRewards: card.pendingRewards,
      rewardName,
      totalVisits: card.totalVisits,
      serial: card.applePassSerial ?? undefined,
      authToken: card.applePassAuthToken ?? undefined,
      tenantName: tenant.name,
      tenantSlug: params.slug,
      primaryColor: tenant.primaryColor,
    });

    if (!card.applePassSerial) {
      await prisma.loyaltyCard.update({
        where: { id: card.id },
        data: { applePassSerial: serial, applePassAuthToken: authToken },
      });
    }

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${params.slug}.pkpass"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[Apple Pass]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Error generando pase: ${msg}` }, { status: 500 });
  }
}
