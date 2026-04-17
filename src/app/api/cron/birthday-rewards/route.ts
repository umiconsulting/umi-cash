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

  const tenants = await prisma.tenant.findMany({
    where: { subscriptionStatus: 'ACTIVE', birthdayRewardEnabled: true },
  });

  let issued = 0;

  for (const tenant of tenants) {
    const tz = tenant.timezone || 'America/Mexico_City';
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const month = localNow.getMonth() + 1; // 1–12
    const year = localNow.getFullYear();

    // Issue on the 1st of the birthday month so customers have the full month to redeem
    type EligibleRow = { cardId: string };
    const eligibleCards = await prisma.$queryRaw<EligibleRow[]>`
      SELECT lc.id AS "cardId"
      FROM "User" u
      JOIN "LoyaltyCard" lc ON lc."userId" = u.id
      WHERE u."tenantId" = ${tenant.id}
        AND u."birthDate" IS NOT NULL
        AND u.role = 'CUSTOMER'
        AND EXTRACT(MONTH FROM u."birthDate") = ${month}
        AND NOT EXISTS (
          SELECT 1 FROM "BirthdayReward" br
          WHERE br."loyaltyCardId" = lc.id
            AND br."tenantId" = ${tenant.id}
            AND br.year = ${year}
        )
    `;

    if (eligibleCards.length === 0) continue;

    const rewardConfig = await getActiveRewardConfig(tenant.id);
    const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);

    // Last day of birthday month at 23:59:59
    const expiresAt = new Date(year, month, 0, 23, 59, 59, 999);

    for (const { cardId } of eligibleCards) {
      try {
        await prisma.birthdayReward.create({
          data: { tenantId: tenant.id, loyaltyCardId: cardId, year, expiresAt, status: 'ACTIVE' },
        });

        const card = await prisma.loyaltyCard.update({
          where: { id: cardId },
          data: { updatedAt: new Date() },
          include: { user: true },
        });

        await Promise.all([
          sendApplePushUpdate(cardId),
          updateGoogleWalletObject({
            cardId,
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
            tenantSlug: tenant.slug,
            primaryColor: tenant.primaryColor,
            birthdayRewardName: tenant.birthdayRewardName,
          }),
        ]);

        issued++;
      } catch (err) {
        console.error(`[Birthday Rewards] Failed for card ${cardId}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  console.log(`[Cron] Birthday rewards: issued ${issued}`);
  return NextResponse.json({ issued });
}
