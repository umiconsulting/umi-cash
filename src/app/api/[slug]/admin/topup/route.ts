import { waitUntil } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { findCardByIdentifier, getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { formatMXN, MAX_TOPUP_CENTAVOS } from '@/lib/currency';
import { DEFAULT_CUSTOMER_NAME, TRANSACTION_TYPES } from '@/lib/constants';
import { sendApplePushUpdate } from '@/lib/push-apple';
import { updateGoogleWalletObject } from '@/lib/pass-google';
import { getTenant, requireActiveSubscription } from '@/lib/tenant';

// Staff top-up limit: $5,000 MXN per day per staff member
const STAFF_DAILY_TOPUP_LIMIT = 500_000;

class LimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimitError';
  }
}

const TopUpSchema = z.object({
  cardId: z.string().min(1),
  amountCentavos: z.number().int().positive().min(100).max(MAX_TOPUP_CENTAVOS),
  note: z.string().max(200).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const staff = await requireAuth(['STAFF', 'ADMIN'])(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (staff.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const suspended = requireActiveSubscription(tenant);
  if (suspended) return suspended;

  try {
    const body = await req.json();
    const { cardId, amountCentavos, note } = TopUpSchema.parse(body);

    const card = await findCardByIdentifier(cardId, tenant.id, { user: true });
    if (!card) return NextResponse.json({ error: 'Tarjeta no encontrada' }, { status: 404 });

    // Staff cannot top up their own card (requires admin approval)
    if (card.userId === staff.sub) {
      return NextResponse.json({ error: 'No puedes recargar tu propia tarjeta' }, { status: 403 });
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    // All limit checks + mutation inside a single transaction to prevent race conditions
    const updatedCard = await prisma.$transaction(async (tx) => {
      // Daily top-up limit per staff member (prevents embezzlement/abuse)
      const staffTodayTotal = await tx.transaction.aggregate({
        _sum: { amountCentavos: true },
        where: { staffId: staff.sub, type: TRANSACTION_TYPES.TOPUP, createdAt: { gte: dayStart } },
      });
      const todaySum = staffTodayTotal._sum.amountCentavos ?? 0;
      if (todaySum + amountCentavos > STAFF_DAILY_TOPUP_LIMIT) {
        throw new LimitError(`Límite diario de recargas alcanzado (máx. ${formatMXN(STAFF_DAILY_TOPUP_LIMIT)} por día). Contacta al administrador.`);
      }

      // Same card cannot receive more than 3 top-ups per day (anti-fraud)
      const cardTopupsToday = await tx.transaction.count({
        where: { cardId: card.id, type: TRANSACTION_TYPES.TOPUP, createdAt: { gte: dayStart } },
      });
      if (cardTopupsToday >= 3) {
        throw new LimitError('Esta tarjeta ya recibió el máximo de recargas por hoy (3). Contacta al administrador.');
      }

      await tx.transaction.create({
        data: {
          cardId: card.id,
          staffId: staff.sub,
          type: TRANSACTION_TYPES.TOPUP,
          amountCentavos,
          description: note ?? 'Recarga en tienda',
        },
      });
      return tx.loyaltyCard.update({
        where: { id: card.id },
        data: { balanceCentavos: { increment: amountCentavos } },
        include: { user: true },
      });
    });

    const rewardConfig = await getActiveRewardConfig(tenant.id);
    const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);

    waitUntil(
      Promise.all([
        sendApplePushUpdate(card.id),
        updateGoogleWalletObject({
          cardId: card.id, cardNumber: card.cardNumber,
          customerName: updatedCard.user.name || DEFAULT_CUSTOMER_NAME,
          balanceCentavos: updatedCard.balanceCentavos,
          visitsThisCycle: updatedCard.visitsThisCycle,
          visitsRequired,
          pendingRewards: updatedCard.pendingRewards,
          rewardName,
          totalVisits: updatedCard.totalVisits,
          memberSince: card.createdAt.toISOString(),
          tenantName: tenant.name,
          tenantSlug: params.slug,
          primaryColor: tenant.primaryColor,
        }),
      ]).catch((err) => console.warn('[Wallet Update]', err))
    );

    return NextResponse.json({
      success: true,
      newBalanceCentavos: updatedCard.balanceCentavos,
      newBalanceMXN: formatMXN(updatedCard.balanceCentavos),
      amountMXN: formatMXN(amountCentavos),
      customer: updatedCard.user.name,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    if (err instanceof LimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    console.error('[TopUp]', err);
    return NextResponse.json({ error: 'Error al recargar' }, { status: 500 });
  }
}
