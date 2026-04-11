import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateApplePass, isAppleWalletConfigured } from '@/lib/pass-apple';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { getActivePromo } from '@/lib/tenant';
import { DEFAULT_CUSTOMER_NAME } from '@/lib/constants';
import { getTenant } from '@/lib/tenant';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    // Accept token from query param (for direct browser navigation on iOS Safari)
    // or from Authorization header
    let user = await requireAuth()(req);
    if (!user) {
      const token = req.nextUrl.searchParams.get('token');
      if (token) {
        const { verifyAccessToken } = await import('@/lib/auth');
        user = await verifyAccessToken(token);
      }
    }
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

    const [card, rewardConfig, locations] = await Promise.all([
      prisma.loyaltyCard.findUnique({ where: { userId: user.sub }, include: { user: true } }),
      getActiveRewardConfig(tenant.id),
      prisma.location.findMany({ where: { tenantId: tenant.id, isActive: true, latitude: { not: null }, longitude: { not: null } } }),
    ]);

    if (!card) return NextResponse.json({ error: 'Tarjeta no encontrada' }, { status: 404 });

    const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);

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
      secondaryColor: tenant.secondaryColor,
      logoUrl: tenant.logoUrl,
      stripImageUrl: tenant.stripImageUrl,
      passStyle: tenant.passStyle,
      promoMessage: getActivePromo(tenant),
      locations: locations.map((l) => ({ latitude: l.latitude!, longitude: l.longitude!, relevantText: `¡Bienvenido a ${tenant.name}!` })),
      topupEnabled: tenant.topupEnabled,
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
        'Content-Disposition': `inline; filename="${params.slug}.pkpass"`,
        'Cache-Control': 'no-store',
        'Content-Security-Policy': '',
      },
    });
  } catch (err) {
    console.error('[Apple Pass]', err);
    return NextResponse.json({ error: 'Error generando pase' }, { status: 500 });
  }
}
