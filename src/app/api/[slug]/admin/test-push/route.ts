import http2 from 'http2';
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { createPrivateKey } from 'crypto';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTenant } from '@/lib/tenant';

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await requireAuth(['ADMIN'])(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant || user.tenantId !== tenant.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log('[test-push]', msg); };

  // Check env vars
  const keyId = process.env.APPLE_APN_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  const apnKeyRaw = process.env.APPLE_APN_KEY;

  log(`APPLE_APN_KEY_ID: ${keyId ? 'set' : 'MISSING'}`);
  log(`APPLE_TEAM_ID: ${teamId ? 'set' : 'MISSING'}`);
  log(`APPLE_PASS_TYPE_ID: ${passTypeId ? 'set (' + passTypeId + ')' : 'MISSING'}`);
  log(`APPLE_APN_KEY: ${apnKeyRaw ? 'set (' + apnKeyRaw.length + ' chars)' : 'MISSING'}`);

  if (!keyId || !teamId || !passTypeId || !apnKeyRaw) {
    return NextResponse.json({ logs, error: 'Missing env vars' });
  }

  // Create JWT
  let jwt: string;
  try {
    const key = Buffer.from(apnKeyRaw, 'base64');
    log(`Key decoded: ${key.length} bytes`);
    log(`Key starts with: ${key.toString('utf8').slice(0, 30)}`);
    const privateKey = createPrivateKey({ key, format: 'pem' });
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
