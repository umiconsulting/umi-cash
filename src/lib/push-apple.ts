/**
 * Apple Push Notifications for Wallet pass updates.
 * Uses native HTTP/2 with .p8 token-based auth (no external deps).
 *
 * Apple's APN endpoint requires HTTP/2 — Node's fetch uses HTTP/1.1,
 * so we must use the http2 module directly.
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
  if (!keyId || !teamId) {
    console.log('[APN] Missing env vars — keyId:', !!keyId, 'teamId:', !!teamId);
    return null;
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.jwt;
  }

  const key = getApnKey();
  if (!key) {
    console.log('[APN] Could not load APN key — APPLE_APN_KEY:', !!process.env.APPLE_APN_KEY);
    return null;
  }

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
    client.on('error', (err) => {
      console.warn(`[APN] Connection error: ${err.message}`);
      resolve(false);
    });

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${pushToken}`,
      authorization: `bearer ${token}`,
      'apns-topic': topic,
      'apns-push-type': 'background',
      'apns-priority': '5',
    });

    req.end('{}');

    let responseData = '';
    req.on('data', (chunk) => { responseData += chunk; });

    req.on('response', (headers) => {
      const status = headers[':status'];
      if (status !== 200) {
        console.warn(`[APN] Push failed for ${pushToken.slice(0, 8)}...: status ${status}`);
      }
    });

    req.on('end', () => {
      if (responseData) {
        console.warn(`[APN] Response body: ${responseData}`);
      }
      client.close();
    });

    req.on('error', (err) => {
      console.warn(`[APN] Request error: ${err.message}`);
      client.close();
      resolve(false);
    });

    // Resolve on close so we wait for the full response
    client.on('close', () => resolve(true));

    req.setTimeout(10000, () => {
      console.warn('[APN] Request timed out');
      req.close();
      client.close();
      resolve(false);
    });
  });
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
  for (const reg of registrations) {
    const ok = await sendPush(token, reg.pushToken, passTypeId);
    console.log(`[APN] Push to ${reg.pushToken.slice(0, 8)}...: ${ok ? 'success' : 'failed'}`);
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

  console.log(`[APN] Updating ${cards.length} card(s) for tenant ${tenantId}`);
  for (const card of cards) {
    await sendApplePushUpdate(card.id);
  }
}
