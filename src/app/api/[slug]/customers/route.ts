import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateCardNumber } from '@/lib/qr';
import { getTenant, requireActiveSubscription } from '@/lib/tenant';
import { randomBytes } from 'crypto';

const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(7).max(20),
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

    const existing = await prisma.user.findUnique({ where: { tenantId_phone: { tenantId: tenant.id, phone: data.phone } } });
    if (existing) return NextResponse.json({ error: 'Este teléfono ya está registrado' }, { status: 409 });

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: data.name,
          phone: data.phone,
          role: 'CUSTOMER',
        },
      });

      const card = await tx.loyaltyCard.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          cardNumber: generateCardNumber(tenant.cardPrefix),
          qrToken: randomBytes(16).toString('hex'),
          // Endowed progress: start with 1 stamp to increase completion rate
          visitsThisCycle: 1,
          totalVisits: 1,
        },
      });

      return { user, card };
    });

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
