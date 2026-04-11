import { waitUntil } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, verifyQRPayload, generateRandomToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { formatMXN } from '@/lib/currency';
import { DEFAULT_CUSTOMER_NAME, SCAN_ACTIONS } from '@/lib/constants';
import { sendApplePushUpdate } from '@/lib/push-apple';
import { updateGoogleWalletObject } from '@/lib/pass-google';
import { getTenant, requireActiveSubscription } from '@/lib/tenant';
import { sendRewardEarnedEmail } from '@/lib/email';

const ScanSchema = z.object({
  qrPayload: z.string().min(1),
  action: z.enum([SCAN_ACTIONS.VISIT, SCAN_ACTIONS.REDEEM]),
});

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const staff = await requireAuth(['STAFF', 'ADMIN'])(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (staff.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const suspended = await requireActiveSubscription(tenant);
  if (suspended) return suspended;

  try {
    const body = await req.json();
    const { qrPayload, action } = ScanSchema.parse(body);

    const qrData = await verifyQRPayload(qrPayload);
    if (!qrData) {
      return NextResponse.json({ error: 'Código QR inválido o expirado' }, { status: 400 });
    }

    const card = await prisma.loyaltyCard.findFirst({
      where: qrData.isWalletScan
        ? { tenantId: tenant.id, cardNumber: qrData.cardId }
        : { tenantId: tenant.id, id: qrData.cardId },
      include: { user: true },
    });

    if (!card) return NextResponse.json({ error: 'Tarjeta no encontrada' }, { status: 404 });

    if (!qrData.isWalletScan && card.qrToken !== qrData.qrToken) {
      return NextResponse.json({
        error: 'Código QR ya fue usado. Pídele al cliente que actualice su código.',
      }, { status: 400 });
    }

    // Wallet scan replay protection: block if a visit was recorded in the last 60 seconds
    if (qrData.isWalletScan && action === SCAN_ACTIONS.VISIT) {
      const recentVisit = await prisma.visit.findFirst({
        where: {
          cardId: card.id,
          scannedAt: { gte: new Date(Date.now() - 60 * 1000) },
        },
      });
      if (recentVisit) {
        return NextResponse.json({
          error: 'Visita ya registrada recientemente. Espera un momento.',
        }, { status: 429 });
      }
    }

    // Staff cannot scan their own loyalty card
    if (card.userId === staff.sub) {
      return NextResponse.json({ error: 'No puedes escanear tu propia tarjeta' }, { status: 403 });
    }

    // Warn on out-of-hours scans based on tenant business hours and timezone
    const tz = tenant.timezone || 'America/Mexico_City';
    const localHour = parseInt(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
    const openH = tenant.openHour ?? 6;
    const closeH = tenant.closeHour ?? 23;
    const isAfterHours = localHour < openH || localHour >= closeH;
    if (isAfterHours) {
      console.warn(`[Scan] After-hours scan by staff ${staff.sub} for card ${card.id} at hour ${localHour} (open: ${openH}-${closeH})`);
    }

    // 1 visit per card per rolling 24-hour window (abuse prevention)
    if (action === SCAN_ACTIONS.VISIT) {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentVisit = await prisma.visit.findFirst({
        where: { cardId: card.id, scannedAt: { gte: since24h } },
      });
      if (recentVisit) {
        return NextResponse.json({
          error: 'Ya se registró una visita en las últimas 24 horas',
        }, { status: 429 });
      }
    }

    const rewardConfig = await getActiveRewardConfig(tenant.id);
    const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);

    if (action === SCAN_ACTIONS.REDEEM) {
      if (card.pendingRewards <= 0) {
        return NextResponse.json({ error: 'No hay recompensas pendientes para canjear' }, { status: 400 });
      }

      // Idempotency: reject if same card was redeemed in last 30 seconds (prevents network retry double-redeem)
      const recentRedemption = await prisma.rewardRedemption.findFirst({
        where: { cardId: card.id, redeemedAt: { gte: new Date(Date.now() - 30 * 1000) } },
      });
      if (recentRedemption) {
        return NextResponse.json({ error: 'Recompensa ya canjeada. Espera un momento si deseas canjear otra.' }, { status: 429 });
      }

      const updatedCard = await prisma.$transaction(async (tx) => {
        await tx.rewardRedemption.create({
          data: { cardId: card.id, configId: rewardConfig?.id ?? 'default', staffId: staff.sub },
        });
        return tx.loyaltyCard.update({
          where: { id: card.id },
          data: { pendingRewards: { decrement: 1 }, qrToken: generateRandomToken() },
          include: { user: true },
        });
      });

      await triggerWalletUpdates(card.id, card.cardNumber, updatedCard, visitsRequired, rewardName, card.createdAt, tenant.name, params.slug, tenant.primaryColor);

      return NextResponse.json({
        success: true,
        action: SCAN_ACTIONS.REDEEM,
        message: `✓ Recompensa canjeada: ${rewardName}`,
        customer: { name: updatedCard.user.name, cardNumber: updatedCard.cardNumber },
        card: buildCardSummary(updatedCard, visitsRequired),
      });
    }

    // VISIT
    const updatedCard = await prisma.$transaction(async (tx) => {
      await tx.visit.create({ data: { cardId: card.id, staffId: staff.sub } });
      const newVisitsThisCycle = card.visitsThisCycle + 1;
      const earnedReward = newVisitsThisCycle >= visitsRequired;
      return tx.loyaltyCard.update({
        where: { id: card.id },
        data: {
          totalVisits: { increment: 1 },
          visitsThisCycle: earnedReward ? 0 : newVisitsThisCycle,
          pendingRewards: earnedReward ? { increment: 1 } : undefined,
          qrToken: generateRandomToken(),
        },
        include: { user: true },
      });
    });

    const rewardEarned = updatedCard.pendingRewards > card.pendingRewards;

    if (rewardEarned && updatedCard.user.email) {
      sendRewardEarnedEmail({
        to: updatedCard.user.email,
        customerName: updatedCard.user.name ?? 'Cliente',
        tenantName: tenant.name,
        rewardName,
        slug: params.slug,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://cash.umiconsulting.co',
        brandColor: tenant.primaryColor,
      }).catch(() => {});
    }

    const remaining = visitsRequired - updatedCard.visitsThisCycle;
    const message = rewardEarned
      ? `¡${updatedCard.user.name ?? 'Cliente'} ganó una recompensa! ${rewardName} disponible.`
      : `✓ Visita #${updatedCard.totalVisits} registrada. ${remaining} visita${remaining !== 1 ? 's' : ''} para ${rewardName}.`;

    triggerWalletUpdates(card.id, card.cardNumber, updatedCard, visitsRequired, rewardName, card.createdAt, tenant.name, params.slug, tenant.primaryColor);

    return NextResponse.json({
      success: true,
      action: SCAN_ACTIONS.VISIT,
      message,
      rewardEarned,
      afterHours: isAfterHours,
      customer: { name: updatedCard.user.name, cardNumber: updatedCard.cardNumber },
      card: buildCardSummary(updatedCard, visitsRequired),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    console.error('[Scan]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error al procesar escaneo' }, { status: 500 });
  }
}

function buildCardSummary(
  card: { visitsThisCycle: number; pendingRewards: number; balanceCentavos: number },
  visitsRequired: number
) {
  return { visitsThisCycle: card.visitsThisCycle, visitsRequired, pendingRewards: card.pendingRewards, balanceMXN: formatMXN(card.balanceCentavos) };
}

async function triggerWalletUpdates(
  cardId: string,
  cardNumber: string,
  card: { visitsThisCycle: number; pendingRewards: number; balanceCentavos: number; totalVisits: number; user: { name: string | null } },
  visitsRequired: number,
  rewardName: string,
  createdAt: Date,
  tenantName: string,
  tenantSlug: string,
  primaryColor: string
) {
  // Await push inline — waitUntil + http2 is unreliable on Vercel
  await Promise.all([
    sendApplePushUpdate(cardId),
    updateGoogleWalletObject({
      cardId, cardNumber,
      customerName: card.user.name || DEFAULT_CUSTOMER_NAME,
      balanceCentavos: card.balanceCentavos,
      visitsThisCycle: card.visitsThisCycle,
      visitsRequired,
      pendingRewards: card.pendingRewards,
      rewardName,
      totalVisits: card.totalVisits,
      memberSince: createdAt.toISOString(),
      tenantName,
      tenantSlug,
      primaryColor,
    }),
  ]).catch((err) => console.warn('[Wallet Update]', err));
}
