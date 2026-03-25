/**
 * Apple Push Notifications for Wallet pass updates.
 * When a customer's card changes, we push a silent notification to their
 * device so Apple Wallet fetches the updated pass automatically.
 */

import { prisma } from './prisma';

export async function sendApplePushUpdate(cardId: string): Promise<void> {
  if (!process.env.APPLE_APN_KEY_PATH || !process.env.APPLE_APN_KEY_ID) {
    return; // Not configured — pass updates only happen when user opens Wallet
  }

  try {
    const tokens = await prisma.applePushToken.findMany({
      where: { cardId },
    });

    if (tokens.length === 0) return;

    // Dynamic import to avoid issues when certs aren't present
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — apn is an optional peer dep; gracefully absent when APNs not configured
    const { default: apn } = await import('apn').catch(() => null) as any;
    if (!apn) return;

    const fs = await import('fs');
    const provider = new apn.Provider({
      token: {
        key: fs.readFileSync(process.env.APPLE_APN_KEY_PATH),
        keyId: process.env.APPLE_APN_KEY_ID,
        teamId: process.env.APPLE_TEAM_ID,
      },
      production: process.env.NODE_ENV === 'production',
    });

    const notification = new apn.Notification();
    notification.topic = `${process.env.APPLE_PASS_TYPE_ID}.voip`;
    notification.pushType = 'background';
    notification.priority = 5;
    notification.payload = {};

    for (const { pushToken } of tokens) {
      await provider.send(notification, pushToken).catch(() => null);
    }

    provider.shutdown();
  } catch (err) {
    console.error('[Apple Push] Error sending push update:', err);
  }
}
