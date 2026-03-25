import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; serial: string } }
) {
  const authToken = req.headers.get('authorization')?.replace('ApplePass ', '');
  if (!authToken) return new NextResponse(null, { status: 401 });

  const card = await prisma.loyaltyCard.findFirst({
    where: { applePassSerial: params.serial, applePassAuthToken: authToken },
  });
  if (!card) return new NextResponse(null, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pushToken = body.pushToken;
  if (!pushToken) return new NextResponse(null, { status: 400 });

  await prisma.applePushToken.upsert({
    where: { cardId_deviceToken: { cardId: card.id, deviceToken: pushToken } },
    update: { pushToken },
    create: { cardId: card.id, deviceToken: pushToken, pushToken },
  });

  return new NextResponse(null, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string; serial: string } }
) {
  const authToken = req.headers.get('authorization')?.replace('ApplePass ', '');
  if (!authToken) return new NextResponse(null, { status: 401 });

  const card = await prisma.loyaltyCard.findFirst({
    where: { applePassSerial: params.serial, applePassAuthToken: authToken },
  });
  if (!card) return new NextResponse(null, { status: 401 });

  const deviceId = req.nextUrl.searchParams.get('deviceId') || '';

  await prisma.applePushToken.deleteMany({
    where: { cardId: card.id, deviceToken: deviceId },
  }).catch(() => null);

  return new NextResponse(null, { status: 200 });
}
