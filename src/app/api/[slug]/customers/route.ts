import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateCardNumber } from '@/lib/qr';
import { getTenant, requireActiveSubscription } from '@/lib/tenant';
import { randomBytes } from 'crypto';
import { sendWelcomeEmail } from '@/lib/email';

const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().optional(),
  email: z.string().email().optional(),
}).refine(d => d.phone || d.email, {
  message: 'Se requiere teléfono o correo electrónico',
});

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  const suspended = requireActiveSubscription(tenant);
  if (suspended) return suspended;

  if (!tenant.selfRegistration) {
    return NextResponse.json({ error: 'El registro no está disponible' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data = RegisterSchema.parse(body);

    if (data.phone) {
      const existing = await prisma.user.findUnique({ where: { tenantId_phone: { tenantId: tenant.id, phone: data.phone } } });
      if (existing) return NextResponse.json({ error: 'Este teléfono ya está registrado' }, { status: 409 });
    }
    if (data.email) {
      const existing = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: data.email } } });
      if (existing) return NextResponse.json({ error: 'Este correo ya está registrado' }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: data.name,
          phone: data.phone,
          email: data.email,
          role: 'CUSTOMER',
        },
      });

      const card = await tx.loyaltyCard.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          cardNumber: generateCardNumber(tenant.cardPrefix),
          qrToken: randomBytes(16).toString('hex'),
        },
      });

      return { user, card };
    });

    if (data.email) {
      sendWelcomeEmail({
        to: data.email,
        customerName: data.name,
        tenantName: tenant.name,
        cardNumber: result.card.cardNumber,
        slug: params.slug,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://cash.umiconsulting.co',
      }).catch(() => {});
    }

    return NextResponse.json({
      userId: result.user.id,
      cardId: result.card.id,
      cardNumber: result.card.cardNumber,
      message: `¡Bienvenido a ${tenant.name}!`,
    }, { status: 201 });

  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
    console.error('[Register]', err);
    return NextResponse.json({ error: 'Error al registrar' }, { status: 500 });
  }
}
