import http2 from 'http2';
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { createPrivateKey } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getTenant } from '@/lib/tenant';

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  // Accept UMI_ADMIN_PASSWORD as bearer token for easy CLI testing
  const authHeader = req.headers.get('authorization');
  const umiPassword = process.env.UMI_ADMIN_PASSWORD;
  if (!umiPassword || authHeader !== `Bearer ${umiPassword}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log('[test-push]', msg); };

  // Check env vars
  const keyId = process.env.APPLE_APN_KEY_ID?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  const apnKeyRaw = process.env.APPLE_APN_KEY;

  log(`APPLE_APN_KEY_ID: ${keyId ? 'set (' + keyId + ')' : 'MISSING'}`);
  log(`APPLE_TEAM_ID: ${teamId ? 'set (' + teamId + ')' : 'MISSING'}`);
  log(`APPLE_PASS_TYPE_ID: ${passTypeId ? 'set (' + passTypeId + ')' : 'MISSING'}`);
  log(`APPLE_APN_KEY env: ${apnKeyRaw ? 'set (' + apnKeyRaw.length + ' chars)' : 'MISSING'}`);

  // Also try file-based key
  let fileKey: Buffer | null = null;
  try {
    const fs = require('fs');
    const path = require('path');
    fileKey = fs.readFileSync(path.join(process.cwd(), 'passes', 'apple', 'apn_key.p8'));
    log(`File key: found (${fileKey!.length} bytes)`);
    const fileBase64 = fileKey!.toString('base64');
    log(`File key base64: ${fileBase64.length} chars`);
    if (apnKeyRaw) {
      log(`Keys match: ${fileBase64 === apnKeyRaw}`);
      if (fileBase64 !== apnKeyRaw) {
        log(`Env first 20: ${apnKeyRaw.slice(0, 20)}`);
        log(`File first 20: ${fileBase64.slice(0, 20)}`);
      }
    }
  } catch (err: any) {
    log(`File key: not found (${err.message})`);
  }

  // Use file key if available, else env var
  const keySource = fileKey || (apnKeyRaw ? Buffer.from(apnKeyRaw, 'base64') : null);

  if (!keyId || !teamId || !passTypeId || !keySource) {
    return NextResponse.json({ logs, error: 'Missing env vars or key' });
  }

  // Create JWT
  let jwt: string;
  try {
    log(`Using key: ${keySource.length} bytes, starts with: ${keySource.toString('utf8').slice(0, 30)}`);
    const privateKey = createPrivateKey({ key: keySource, format: 'pem' });
    jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt()
      .sign(privateKey);
    log('JWT created successfully');
  } catch (err: any) {
    log(`JWT creation failed: ${err.message}`);
    return NextResponse.json({ logs, error: 'JWT failed' });
  }

  // Find push tokens
  const tokens = await prisma.applePushToken.findMany({
    where: { card: { tenantId: tenant.id } },
    include: { card: true },
  });
  log(`Found ${tokens.length} push token(s)`);

  // Send push to each
  const results: any[] = [];
  for (const t of tokens) {
    log(`Pushing to ${t.card.cardNumber} device=${t.deviceToken.slice(0, 12)}... push=${t.pushToken.slice(0, 12)}...`);

    const result = await new Promise<any>((resolve) => {
      const client = http2.connect('https://api.push.apple.com');
      client.on('error', (err) => {
        log(`Connection error: ${err.message}`);
        resolve({ error: 'connection', message: err.message });
      });

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${t.pushToken}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': passTypeId,
        'apns-push-type': 'background',
        'apns-priority': '5',
      });
      req.end('{}');

      let body = '';
      let status = 0;
      req.on('data', (chunk) => { body += chunk; });
      req.on('response', (headers) => {
        status = headers[':status'] as number;
        log(`APN response status: ${status}`);
      });
      req.on('end', () => {
        if (body) log(`APN response body: ${body}`);
        client.close();
        resolve({ status, body: body || null, card: t.card.cardNumber });
      });
      req.on('error', (err) => {
        log(`Request error: ${err.message}`);
        client.close();
        resolve({ error: 'request', message: err.message });
      });
      req.setTimeout(10000, () => {
        log('Request timed out');
        req.close();
        client.close();
        resolve({ error: 'timeout' });
      });
    });

    results.push(result);
  }

  return NextResponse.json({ logs, results });
}
