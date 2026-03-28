/**
 * Apple Push Notifications for Wallet pass updates.
 * Uses fetch (HTTP/2 via undici on Vercel) with .p8 token-based auth.
 */

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

async function sendPush(token: string, pushToken: string, topic: string): Promise<boolean> {
  try {
    const res = await fetch(`${APN_HOST}/3/device/${pushToken}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${token}`,
        'apns-topic': topic,
        'apns-push-type': 'background',
        'apns-priority': '5',
      },
      body: '{}',
    });

    if (res.status !== 200) {
      const body = await res.text().catch(() => '');
      console.warn(`[APN] Push failed for ${pushToken.slice(0, 8)}...: status ${res.status} ${body}`);
    }
    return res.status === 200;
  } catch (err) {
    console.warn(`[APN] Push error for ${pushToken.slice(0, 8)}...:`, err);
    return false;
  }
}

/**
 * Push update to all devices registered for a single card.
 */
export async function sendApplePushUpdate(cardId: string): Promise<void> {
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  if (!passTypeId) { console.log('[APN] No APPLE_PASS_TYPE_ID set, skipping push'); return; }

  const token = await getApnToken();
  if (!token) { console.log('[APN] Could not get APN token, skipping push'); return; }

  const registrations = await prisma.applePushToken.findMany({ where: { cardId } });
  if (registrations.length === 0) { console.log(`[APN] No registered devices for card ${cardId}`); return; }

  console.log(`[APN] Sending push to ${registrations.length} device(s) for card ${cardId}`);
  const results = await Promise.allSettled(
    registrations.map(async (reg) => {
      const ok = await sendPush(token, reg.pushToken, passTypeId);
      console.log(`[APN] Push to ${reg.pushToken.slice(0, 8)}...: ${ok ? 'success' : 'failed'}`);
      return ok;
    })
  );
  console.log(`[APN] Push complete: ${results.filter((r) => r.status === 'fulfilled' && r.value).length}/${results.length} succeeded`);
}

/**
 * Push update to ALL cards for a tenant (e.g., when reward config changes).
 */
export async function sendApplePushUpdateForTenant(tenantId: string): Promise<void> {
  const cards = await prisma.loyaltyCard.findMany({
    where: { tenantId, applePassSerial: { not: null } },
    select: { id: true },
  });

  console.log(`[APN] Updating ${cards.length} card(s) for tenant ${tenantId}`);
  for (const card of cards) {
    await sendApplePushUpdate(card.id);
  }
}
