import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, generateRandomToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatMXN } from '@/lib/currency';
import { getTenant, requireActiveSubscription } from '@/lib/tenant';
import { sendGiftCardEmail } from '@/lib/email';
import { sendWhatsAppGiftCard } from '@/lib/whatsapp';

const CreateSchema = z.object({
  amountCentavos: z.number().int().min(100, 'El monto mínimo es $1.00'),
  senderName: z.string().max(100).optional(),
  message: z.string().max(300).optional(),
  recipientEmail: z.string().email().optional(),
  recipientPhone: z.string().max(20).optional(),
  recipientName: z.string().max(100).optional(),
}).refine((d) => d.recipientEmail || d.recipientPhone, {
  message: 'Se requiere email o teléfono del destinatario',
});

function generateGiftCode(): string {
  // Format: XXXX-XXXX (8 hex chars, uppercase)
  const hex = generateRandomToken(4).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

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
    const data = CreateSchema.parse(await req.json());

    // Generate a unique code (retry on collision — extremely rare)
    let code: string;
    let attempts = 0;
    do {
      code = generateGiftCode();
      const existing = await prisma.giftCard.findUnique({ where: { code } });
      if (!existing) break;
      attempts++;
    } while (attempts < 5);

    const giftCard = await prisma.giftCard.create({
      data: {
        tenantId: tenant.id,
        code: code!,
        amountCentavos: data.amountCentavos,
        createdByStaffId: staff.sub,
        senderName: data.senderName || null,
        message: data.message || null,
        recipientEmail: data.recipientEmail || null,
        recipientPhone: data.recipientPhone || null,
        recipientName: data.recipientName || null,
      },
    });

    // Send notification via email and/or WhatsApp
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`;
    const redeemUrl = `${appUrl}/${params.slug}/gift/${giftCard.code}`;
    const notifyOpts = {
      recipientName: data.recipientName ?? null,
      senderName: data.senderName ?? null,
      tenantName: tenant.name,
      amountMXN: formatMXN(data.amountCentavos),
      message: data.message ?? null,
      redeemUrl,
    };

    if (data.recipientEmail) {
      sendGiftCardEmail({ to: data.recipientEmail, ...notifyOpts })
        .catch((err) => console.warn('[GiftCard:email]', err));
    }
    if (data.recipientPhone) {
      sendWhatsAppGiftCard({ to: data.recipientPhone, ...notifyOpts })
        .catch((err) => console.warn('[GiftCard:whatsapp]', err));
    }

    return NextResponse.json({
      success: true,
      giftCard: {
        id: giftCard.id,
        code: giftCard.code,
        amountMXN: formatMXN(giftCard.amountCentavos),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    console.error('[GiftCard:create]', err);
    return NextResponse.json({ error: 'Error al crear tarjeta de regalo' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const staff = await requireAuth(['STAFF', 'ADMIN'])(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (staff.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const limit = 20;

  const [giftCards, total] = await Promise.all([
    prisma.giftCard.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.giftCard.count({ where: { tenantId: tenant.id } }),
  ]);

  return NextResponse.json({
    giftCards: giftCards.map((g) => ({
      id: g.id,
      code: g.code,
      amountMXN: formatMXN(g.amountCentavos),
      amountCentavos: g.amountCentavos,
      senderName: g.senderName,
      recipientName: g.recipientName,
      recipientEmail: g.recipientEmail,
      recipientPhone: g.recipientPhone,
      message: g.message,
      isRedeemed: g.isRedeemed,
      redeemedAt: g.redeemedAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
