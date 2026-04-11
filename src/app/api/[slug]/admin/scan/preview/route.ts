import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, verifyQRPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { formatMXN } from '@/lib/currency';
import { getTenant, requireActiveSubscription } from '@/lib/tenant';

const PreviewSchema = z.object({
  qrPayload: z.string().min(1),
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
    const { qrPayload } = PreviewSchema.parse(await req.json());

    // Try QR payload first; if it fails, try as card number or phone number
    const qrData = await verifyQRPayload(qrPayload);
    let card;

    if (qrData) {
      card = await prisma.loyaltyCard.findFirst({
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
    } else {
      // Manual lookup: card number, phone number, or name
      const input = qrPayload.trim();
      card = await prisma.loyaltyCard.findFirst({
        where: {
          tenantId: tenant.id,
          OR: [
            { cardNumber: input },
            { user: { phone: input } },
            { user: { phone: input.startsWith('+') ? input : `+52${input.replace(/\D/g, '')}` } },
          ],
        },
        include: { user: true },
      });

      if (!card) return NextResponse.json({ error: 'Tarjeta no encontrada. Verifica el número o teléfono.' }, { status: 404 });
    }

    if (card.userId === staff.sub) {
      return NextResponse.json({ error: 'No puedes escanear tu propia tarjeta' }, { status: 403 });
    }

    const rewardConfig = await getActiveRewardConfig(tenant.id);
    const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);

    // Check 24-hour rolling visit limit
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentVisit = await prisma.visit.findFirst({
      where: { cardId: card.id, scannedAt: { gte: since24h } },
      orderBy: { scannedAt: 'desc' },
    });

    return NextResponse.json({
      cardId: card.id,
      cardNumber: card.cardNumber,
      customer: { name: card.user.name },
      card: {
        visitsThisCycle: card.visitsThisCycle,
        visitsRequired,
        pendingRewards: card.pendingRewards,
        balanceMXN: formatMXN(card.balanceCentavos),
        balanceCentavos: card.balanceCentavos,
        rewardName,
        visitLimitReached: !!recentVisit,
        lastVisitAt: recentVisit?.scannedAt ?? null,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    console.error('[Preview]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error al leer la tarjeta' }, { status: 500 });
  }
}
