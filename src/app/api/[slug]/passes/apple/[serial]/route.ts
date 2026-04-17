import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApplePass, isAppleWalletConfigured } from '@/lib/pass-apple';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { DEFAULT_CUSTOMER_NAME } from '@/lib/constants';
import { getTenant, getActivePromo } from '@/lib/tenant';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; serial: string } }
) {
  if (!isAppleWalletConfigured()) return new NextResponse(null, { status: 503 });

  const authToken = req.headers.get('authorization')?.replace('ApplePass ', '');
  if (!authToken) return new NextResponse(null, { status: 401 });

  const card = await prisma.loyaltyCard.findFirst({
    where: { applePassSerial: params.serial, applePassAuthToken: authToken },
    include: { user: { select: { name: true } } },
  });
  if (!card) return new NextResponse(null, { status: 401 });

  const ifModifiedSince = req.headers.get('if-modified-since');
  if (ifModifiedSince && card.updatedAt <= new Date(ifModifiedSince)) {
    return new NextResponse(null, { status: 304 });
  }

  const tenant = await getTenant(params.slug);
  if (!tenant) return new NextResponse(null, { status: 404 });

  const [rewardConfig, locations, activeBirthdayReward] = await Promise.all([
    getActiveRewardConfig(card.tenantId),
    prisma.location.findMany({ where: { tenantId: tenant.id, isActive: true, latitude: { not: null }, longitude: { not: null } } }),
    prisma.birthdayReward.findFirst({
      where: { loyaltyCardId: card.id, status: 'ACTIVE', expiresAt: { gte: new Date() } },
    }),
  ]);
  const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);

  try {
    const { buffer } = await generateApplePass({
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
      birthdayRewardName: activeBirthdayReward ? tenant.birthdayRewardName : null,
      locations: locations.map((l) => ({ latitude: l.latitude!, longitude: l.longitude!, relevantText: `¡Bienvenido a ${tenant.name}!` })),
      topupEnabled: tenant.topupEnabled,
    });

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Last-Modified': card.updatedAt.toUTCString(),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[Apple Pass Update]', err instanceof Error ? err.message : String(err));
    return new NextResponse(null, { status: 500 });
  }
}
