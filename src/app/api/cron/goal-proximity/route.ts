import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { sendApplePushUpdate } from '@/lib/push-apple';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    where: { subscriptionStatus: 'ACTIVE' },
  });

  let notified = 0;

  for (const tenant of tenants) {
    const rewardConfig = await getActiveRewardConfig(tenant.id);
    const { visitsRequired } = rewardConfigDefaults(rewardConfig);

    // Find customers who are 1-2 visits away from a reward
    // AND haven't visited in the last 3 days
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const nearGoalCards = await prisma.loyaltyCard.findMany({
      where: {
        tenantId: tenant.id,
        visitsThisCycle: { gte: visitsRequired - 2 },
        applePassSerial: { not: null },
        // Only cards with no visit in last 3 days
        visits: { none: { scannedAt: { gte: threeDaysAgo } } },
      },
      select: { id: true },
    });

    // Send push to each card — the pass update will show current state
    // and the changeMessage on the "remaining" field acts as the nudge
    for (const card of nearGoalCards) {
      try {
        // Touch the card so Apple sees it as updated
        await prisma.loyaltyCard.update({
          where: { id: card.id },
          data: { updatedAt: new Date() },
        });
        await sendApplePushUpdate(card.id);
        notified++;
      } catch (err) {
        console.error(`[Goal Proximity] Push failed for card ${card.id}:`, err);
      }
    }
  }

  console.log(`[Cron] Goal proximity: notified ${notified} customers`);
  return NextResponse.json({ notified });
}
