/**
 * Apple Wallet Web Service endpoints (catch-all).
 *
 * Apple sends requests to {webServiceURL}/v1/... — this route handles:
 *   POST   /devices/{deviceId}/registrations/{passTypeId}/{serial}  — register device
 *   DELETE  /devices/{deviceId}/registrations/{passTypeId}/{serial}  — unregister
 *   GET    /devices/{deviceId}/registrations/{passTypeId}           — list updated serials
 *   GET    /passes/{passTypeId}/{serial}                            — serve latest pass
 *   POST   /log                                                     — device error log
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApplePass, isAppleWalletConfigured } from '@/lib/pass-apple';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { DEFAULT_CUSTOMER_NAME } from '@/lib/constants';
import { getTenant } from '@/lib/tenant';

function matchRoute(segments: string[]): { handler: string; params: Record<string, string> } | null {
  // POST /log
  if (segments.length === 1 && segments[0] === 'log') {
    return { handler: 'log', params: {} };
  }
  // GET /passes/{passTypeId}/{serial}
  if (segments.length === 3 && segments[0] === 'passes') {
    return { handler: 'getPass', params: { passTypeId: segments[1], serial: segments[2] } };
  }
  // GET /devices/{deviceId}/registrations/{passTypeId}
  if (segments.length === 4 && segments[0] === 'devices' && segments[2] === 'registrations') {
    return { handler: 'listSerials', params: { deviceId: segments[1], passTypeId: segments[3] } };
  }
  // POST|DELETE /devices/{deviceId}/registrations/{passTypeId}/{serial}
  if (segments.length === 5 && segments[0] === 'devices' && segments[2] === 'registrations') {
    return {
      handler: 'registration',
      params: { deviceId: segments[1], passTypeId: segments[3], serial: segments[4] },
    };
  }
  return null;
}

function getAuthToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('ApplePass ')) return null;
  return header.slice(10);
}

async function verifyPassAuth(serial: string, authToken: string) {
  return prisma.loyaltyCard.findFirst({
    where: { applePassSerial: serial, applePassAuthToken: authToken },
    include: { user: true },
  });
}

export async function GET(req: NextRequest, { params }: { params: { slug: string; path: string[] } }) {
  const route = matchRoute(params.path);
  if (!route) return new NextResponse(null, { status: 404 });

  if (route.handler === 'getPass') {
    return handleGetPass(req, params.slug, route.params.serial);
  }
  if (route.handler === 'listSerials') {
    return handleListSerials(req, params.slug, route.params.deviceId, route.params.passTypeId);
  }
  return new NextResponse(null, { status: 404 });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string; path: string[] } }) {
  const route = matchRoute(params.path);
  if (!route) return new NextResponse(null, { status: 404 });

  if (route.handler === 'log') {
    const body = await req.json().catch(() => null);
    console.log('[Apple Pass Log]', JSON.stringify(body));
    return new NextResponse(null, { status: 200 });
  }
  if (route.handler === 'registration') {
    return handleRegister(req, route.params.deviceId, route.params.serial);
  }
  return new NextResponse(null, { status: 404 });
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string; path: string[] } }) {
  const route = matchRoute(params.path);
  if (!route || route.handler !== 'registration') return new NextResponse(null, { status: 404 });
  return handleUnregister(req, route.params.deviceId, route.params.serial);
}

// ─── Register device for push updates ────────────────────────────────────────

async function handleRegister(req: NextRequest, deviceId: string, serial: string) {
  const authToken = getAuthToken(req);
  if (!authToken) return new NextResponse(null, { status: 401 });

  const card = await verifyPassAuth(serial, authToken);
  if (!card) return new NextResponse(null, { status: 401 });

  const body = await req.json().catch(() => null);
  const pushToken = body?.pushToken;
  if (!pushToken) return new NextResponse(null, { status: 400 });

  const existing = await prisma.applePushToken.findUnique({
    where: { cardId_deviceToken: { cardId: card.id, deviceToken: deviceId } },
  });

  await prisma.applePushToken.upsert({
    where: { cardId_deviceToken: { cardId: card.id, deviceToken: deviceId } },
    update: { pushToken },
    create: { cardId: card.id, deviceToken: deviceId, pushToken },
  });

  // 200 = already registered, 201 = new registration
  return new NextResponse(null, { status: existing ? 200 : 201 });
}

// ─── Unregister device ───────────────────────────────────────────────────────

async function handleUnregister(req: NextRequest, deviceId: string, serial: string) {
  const authToken = getAuthToken(req);
  if (!authToken) return new NextResponse(null, { status: 401 });

  const card = await verifyPassAuth(serial, authToken);
  if (!card) return new NextResponse(null, { status: 401 });

  await prisma.applePushToken.deleteMany({
    where: { cardId: card.id, deviceToken: deviceId },
  });

  return new NextResponse(null, { status: 200 });
}

// ─── List updated serial numbers ─────────────────────────────────────────────

async function handleListSerials(req: NextRequest, slug: string, deviceId: string, passTypeId: string) {
  const tenant = await getTenant(slug);
  if (!tenant) return new NextResponse(null, { status: 404 });

  const since = req.nextUrl.searchParams.get('passesUpdatedSince');
  const sinceDate = since ? new Date(parseInt(since) * 1000) : new Date(0);

  // Find cards for this device scoped to the current tenant
  const registrations = await prisma.applePushToken.findMany({
    where: { deviceToken: deviceId, card: { tenantId: tenant.id } },
    include: { card: true },
  });

  const serials = registrations
    .filter((r) => r.card.applePassSerial && r.card.updatedAt > sinceDate)
    .map((r) => r.card.applePassSerial!);

  if (serials.length === 0) return new NextResponse(null, { status: 204 });

  return NextResponse.json({
    serialNumbers: serials,
    lastUpdated: String(Math.floor(Date.now() / 1000)),
  });
}

// ─── Serve latest pass ───────────────────────────────────────────────────────

async function handleGetPass(req: NextRequest, slug: string, serial: string) {
  const authToken = getAuthToken(req);
  if (!authToken) return new NextResponse(null, { status: 401 });

  const card = await verifyPassAuth(serial, authToken);
  if (!card) return new NextResponse(null, { status: 401 });

  if (!isAppleWalletConfigured()) return new NextResponse(null, { status: 500 });

  const tenant = await getTenant(slug);
  if (!tenant) return new NextResponse(null, { status: 404 });

  const [rewardConfig, locations] = await Promise.all([
    getActiveRewardConfig(tenant.id),
    prisma.location.findMany({ where: { tenantId: tenant.id, isActive: true, latitude: { not: null }, longitude: { not: null } } }),
  ]);
  const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);

  try {
    const { buffer } = await generateApplePass({
      cardId: card.id,
      cardNumber: card.cardNumber,
      customerName: card.user.name || DEFAULT_CUSTOMER_NAME,
      balanceCentavos: card.balanceCentavos,
      visitsThisCycle: card.visitsThisCycle,
      visitsRequired,
      pendingRewards: card.pendingRewards,
      rewardName,
      totalVisits: card.totalVisits,
      serial: card.applePassSerial!,
      authToken: card.applePassAuthToken!,
      tenantName: tenant.name,
      tenantSlug: slug,
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
      logoUrl: tenant.logoUrl,
      stripImageUrl: tenant.stripImageUrl,
      passStyle: tenant.passStyle,
      promoMessage: tenant.promoMessage,
      locations: locations.map((l) => ({ latitude: l.latitude!, longitude: l.longitude!, relevantText: `¡Bienvenido a ${tenant.name}!` })),
      topupEnabled: tenant.topupEnabled,
    });

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Last-Modified': card.updatedAt.toUTCString(),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[Apple Pass Update]', err);
    return new NextResponse(null, { status: 500 });
  }
}
