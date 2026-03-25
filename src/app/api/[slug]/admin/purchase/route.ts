import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, generateRandomToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { formatMXN } from '@/lib/currency';
import { DEFAULT_CUSTOMER_NAME } from '@/lib/constants';
import { getTenant, requireActiveSubscription } from '@/lib/tenant';
import { sendApplePushUpdate } from '@/lib/push-apple';
import { updateGoogleWalletObject } from '@/lib/pass-google';

const PurchaseSchema = z.object({
  cardId: z.string().min(1),
  amountCentavos: z.number().int().min(1, 'El monto mínimo es $0.01'),
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
    const { cardId, amountCentavos, note } = PurchaseSchema.parse(await req.json());

    const card = await prisma.loyaltyCard.findFirst({
      where: { id: cardId, tenantId: tenant.id },
      include: { user: true },
    });

    if (!card) return NextResponse.json({ error: 'Tarjeta no encontrada' }, { status: 404 });

    if (card.balanceCentavos < amountCentavos) {
      return NextResponse.json({
        error: `Saldo insuficiente. Disponible: ${formatMXN(card.balanceCentavos)}`,
      }, { status: 400 });
    }

    const updatedCard = await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          cardId: card.id,
          staffId: staff.sub,
          type: 'PURCHASE',
          amountCentavos: -amountCentavos,
          description: note || 'Pago con saldo',
        },
      });
      return tx.loyaltyCard.update({
        where: { id: card.id },
        data: {
          balanceCentavos: { decrement: amountCentavos },
          qrToken: generateRandomToken(),
        },
        include: { user: true },
      });
    });

    const rewardConfig = await getActiveRewardConfig(tenant.id);
    const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);

    Promise.all([
      sendApplePushUpdate(card.id),
      updateGoogleWalletObject({
        cardId: card.id,
        cardNumber: card.cardNumber,
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
    ]).catch((err) => console.warn('[Wallet Update]', err));

    return NextResponse.json({
      success: true,
      amountMXN: formatMXN(amountCentavos),
      newBalanceMXN: formatMXN(updatedCard.balanceCentavos),
      customer: updatedCard.user.name,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    console.error('[Purchase]', err);
    return NextResponse.json({ error: 'Error al procesar pago' }, { status: 500 });
  }
}
