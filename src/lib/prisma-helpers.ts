import { prisma } from './prisma';
import { DEFAULT_VISITS_REQUIRED, DEFAULT_REWARD_NAME } from './constants';

export async function getActiveRewardConfig(tenantId: string) {
  return prisma.rewardConfig.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { activatedAt: 'desc' },
  });
}

export function rewardConfigDefaults(config: Awaited<ReturnType<typeof getActiveRewardConfig>>) {
  return {
    visitsRequired: config?.visitsRequired ?? DEFAULT_VISITS_REQUIRED,
    rewardName: config?.rewardName ?? DEFAULT_REWARD_NAME,
    rewardDescription: config?.rewardDescription ?? null,
  };
}

/** Find a loyalty card by its cuid ID or PREFIX-XXXXXXXXX card number, scoped to a tenant. */
export async function findCardByIdentifier(
  identifier: string,
  tenantId: string,
  include?: { user?: boolean }
) {
  return prisma.loyaltyCard.findFirst({
    where: {
      tenantId,
      OR: [{ id: identifier }, { cardNumber: identifier }],
    },
    include: include ?? {},
  });
}
