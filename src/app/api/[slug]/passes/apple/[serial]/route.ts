import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApplePass, isAppleWalletConfigured } from '@/lib/pass-apple';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { DEFAULT_CUSTOMER_NAME } from '@/lib/constants';

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

  const rewardConfig = await getActiveRewardConfig(card.tenantId);
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
    });

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Last-Modified': card.updatedAt.toUTCString(),
      },
    });
  } catch (err) {
    console.error('[Apple Pass Update]', err);
    return new NextResponse(null, { status: 500 });
  }
}
