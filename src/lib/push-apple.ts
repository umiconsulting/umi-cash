/**
 * Apple Push Notifications for Wallet pass updates.
 * Uses native HTTP/2 with .p8 token-based auth (no external deps).
 */

import http2 from 'http2';
import { SignJWT } from 'jose';
import { createPrivateKey } from 'crypto';
import { prisma } from './prisma';

const APN_HOST = 'https://api.push.apple.com';

let cachedToken: { jwt: string; expiresAt: number } | null = null;

function getApnKey(): Buffer | null {
  if (process.env.APPLE_APN_KEY) {
    return Buffer.from(process.env.APPLE_APN_KEY, 'base64');
  }
  try {
    const fs = require('fs');
    const path = require('path');
    return fs.readFileSync(path.join(process.cwd(), 'passes', 'apple', 'apn_key.p8'));
  } catch {
    return null;
  }
}

async function getApnToken(): Promise<string | null> {
  const keyId = process.env.APPLE_APN_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  if (!keyId || !teamId) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.jwt;
  }

  const key = getApnKey();
  if (!key) return null;

  const privateKey = createPrivateKey({ key, format: 'pem' });

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .sign(privateKey);

  cachedToken = { jwt, expiresAt: Date.now() + 50 * 60 * 1000 };
  return jwt;
}

function sendPush(token: string, pushToken: string, topic: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = http2.connect(APN_HOST);
    client.on('error', () => resolve(false));

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${pushToken}`,
      authorization: `bearer ${token}`,
      'apns-topic': topic,
      'apns-push-type': 'background',
      'apns-priority': '5',
    });

    req.end('{}');

    req.on('response', (headers) => {
      const status = headers[':status'];
      if (status !== 200) {
        console.warn(`[APN] Push failed for ${pushToken.slice(0, 8)}...: status ${status}`);
      }
      resolve(status === 200);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(10000, () => {
      req.close();
      resolve(false);
    });

    req.on('close', () => client.close());
  });
}

/**
 * Push update to all devices registered for a single card.
 */
export async function sendApplePushUpdate(cardId: string): Promise<void> {
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  if (!passTypeId) return;

  const token = await getApnToken();
  if (!token) return;

  const registrations = await prisma.applePushToken.findMany({ where: { cardId } });
  if (registrations.length === 0) return;

  for (const reg of registrations) {
    await sendPush(token, reg.pushToken, passTypeId).catch(() => null);
  }
}

/**
 * Push update to ALL cards for a tenant (e.g., when reward config changes).
 */
export async function sendApplePushUpdateForTenant(tenantId: string): Promise<void> {
  const cards = await prisma.loyaltyCard.findMany({
    where: { tenantId, applePassSerial: { not: null } },
    select: { id: true },
  });

  for (const card of cards) {
    await sendApplePushUpdate(card.id);
  }
}
