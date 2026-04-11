import { waitUntil } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { formatMXN } from '@/lib/currency';
import { getTenant } from '@/lib/tenant';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { sendApplePushUpdate } from '@/lib/push-apple';
import { updateGoogleWalletObject } from '@/lib/pass-google';
import { DEFAULT_CUSTOMER_NAME } from '@/lib/constants';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

// GET — fetch gift card info (public but minimal — only shows if valid and redeemed status)
export async function GET(req: NextRequest, { params }: { params: { slug: string; code: string } }) {
  // Rate limit lookups to prevent code enumeration
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`gift-lookup:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  const giftCard = await prisma.giftCard.findFirst({
    where: { code: params.code.toUpperCase(), tenantId: tenant.id },
  });

  if (!giftCard) return NextResponse.json({ error: 'Código no válido' }, { status: 404 });

  // Only expose minimal info — don't leak amount/sender to unauthenticated users
  return NextResponse.json({
    code: giftCard.code,
    isRedeemed: giftCard.isRedeemed,
    tenantName: tenant.name,
    hasMessage: !!giftCard.message,
  });
}

const RedeemSchema = z.object({
  // The customer identifies themselves by phone or email to find their card
  phone: z.string().optional(),
  email: z.string().email().optional(),
}).refine((d) => d.phone || d.email, {
  message: 'Se requiere teléfono o email para identificarte',
});

// POST — redeem gift card
export async function POST(req: NextRequest, { params }: { params: { slug: string; code: string } }) {
  // Rate limit redemption attempts to prevent brute-force code guessing
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`gift-redeem:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  try {
    const { phone, email } = RedeemSchema.parse(await req.json());

    const giftCard = await prisma.giftCard.findFirst({
      where: { code: params.code.toUpperCase(), tenantId: tenant.id },
    });

    if (!giftCard) return NextResponse.json({ error: 'Código no válido' }, { status: 404 });
    if (giftCard.isRedeemed) {
      return NextResponse.json({ error: 'Esta tarjeta de regalo ya fue canjeada' }, { status: 400 });
    }
    if (giftCard.expiresAt && giftCard.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Esta tarjeta de regalo ha expirado' }, { status: 400 });
    }

    // Find the customer's loyalty card using normalized E.164 phone
    let user;
    if (phone) {
      const normalizedPhone = phone.startsWith('+')
        ? '+' + phone.slice(1).replace(/\D/g, '')
        : phone.replace(/\D/g, '');
      user = await prisma.user.findFirst({
        where: { tenantId: tenant.id, phone: normalizedPhone },
        include: { card: true },
      });
    } else {
      user = await prisma.user.findFirst({
        where: { tenantId: tenant.id, email: email! },
        include: { card: true },
      });
    }


    if (!user || !user.card) {
      return NextResponse.json({
        error: 'No encontramos una tarjeta de lealtad con ese teléfono/email. Regístrate primero.',
        needsRegistration: true,
      }, { status: 404 });
    }

    // Redeem: credit the balance and mark as redeemed in a transaction
    const updatedCard = await prisma.$transaction(async (tx) => {
      await tx.giftCard.update({
        where: { id: giftCard.id },
        data: {
          isRedeemed: true,
          redeemedAt: new Date(),
          redeemedCardId: user.card!.id,
        },
      });

      await tx.transaction.create({
        data: {
          cardId: user.card!.id,
          type: 'TOPUP',
          amountCentavos: giftCard.amountCentavos,
          description: giftCard.senderName
            ? `Tarjeta de regalo de ${giftCard.senderName}`
            : 'Tarjeta de regalo',
        },
      });

      return tx.loyaltyCard.update({
        where: { id: user.card!.id },
        data: { balanceCentavos: { increment: giftCard.amountCentavos } },
        include: { user: true },
      });
    });

    // Update wallet passes
    const rewardConfig = await getActiveRewardConfig(tenant.id);
    const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);
    // Await push inline — waitUntil + http2 is unreliable on Vercel
    await Promise.all([
      sendApplePushUpdate(user.card.id),
      updateGoogleWalletObject({
        cardId: user.card.id,
        cardNumber: user.card.cardNumber,
        customerName: updatedCard.user.name || DEFAULT_CUSTOMER_NAME,
        balanceCentavos: updatedCard.balanceCentavos,
        visitsThisCycle: updatedCard.visitsThisCycle,
        visitsRequired,
        pendingRewards: updatedCard.pendingRewards,
        rewardName,
        totalVisits: updatedCard.totalVisits,
        memberSince: user.card.createdAt.toISOString(),
        tenantName: tenant.name,
        tenantSlug: params.slug,
        primaryColor: tenant.primaryColor,
      }),
    ]).catch((err) => console.warn('[GiftCard:walletUpdate]', err));

    return NextResponse.json({
      success: true,
      amountMXN: formatMXN(giftCard.amountCentavos),
      newBalanceMXN: formatMXN(updatedCard.balanceCentavos),
      customerName: updatedCard.user.name,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    console.error('[GiftCard:redeem]', err);
    return NextResponse.json({ error: 'Error al canjear' }, { status: 500 });
  }
}
