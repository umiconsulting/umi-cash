import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendApplePushUpdate } from '@/lib/push-apple';
import { updateGoogleWalletObject } from '@/lib/pass-google';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { DEFAULT_CUSTOMER_NAME } from '@/lib/constants';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expiredRewards = await prisma.birthdayReward.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
    include: {
      loyaltyCard: { include: { user: true } },
      tenant: true,
    },
  });

  let expired = 0;

  for (const reward of expiredRewards) {
    try {
      await prisma.birthdayReward.update({
        where: { id: reward.id },
        data: { status: 'EXPIRED' },
      });

      const card = await prisma.loyaltyCard.update({
        where: { id: reward.loyaltyCardId },
        data: { updatedAt: new Date() },
        include: { user: true },
      });

      const rewardConfig = await getActiveRewardConfig(reward.tenantId);
      const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);

      await Promise.all([
        sendApplePushUpdate(reward.loyaltyCardId),
        updateGoogleWalletObject({
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
          tenantName: reward.tenant.name,
          tenantSlug: reward.tenant.slug,
          primaryColor: reward.tenant.primaryColor,
          birthdayRewardName: null, // remove birthday field from pass
        }),
      ]);

      expired++;
    } catch (err) {
      console.error(`[Expire Birthday Rewards] Failed for reward ${reward.id}:`, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(`[Cron] Expired birthday rewards: ${expired}`);
  return NextResponse.json({ expired });
}
