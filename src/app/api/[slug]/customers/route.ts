import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateCardNumber } from '@/lib/qr';
import { createSession } from '@/lib/auth';
import { getTenant, requireActiveSubscription } from '@/lib/tenant';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createHash, randomBytes } from 'crypto';

const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(7).max(20),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  // Rate limit: max 3 registrations per IP per hour
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`register:${params.slug}:${ip}`, 3, 60 * 60 * 1000);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  // Device fingerprint rate limit: max 3 registrations per device per day
  const ua = req.headers.get('user-agent') ?? '';
  const deviceHash = createHash('sha256').update(`${ua}:${ip}`).digest('hex').slice(0, 16);
  const drl = rateLimit(`register-device:${deviceHash}`, 3, 24 * 60 * 60 * 1000);
  if (!drl.allowed) return rateLimitResponse(drl.resetAt);

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  const suspended = await requireActiveSubscription(tenant);
  if (suspended) return suspended;

  if (!tenant.selfRegistration) {
    return NextResponse.json({ error: 'El registro no está disponible' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data = RegisterSchema.parse(body);

    // Normalize phone to E.164: strip non-digits except leading +
    const normalizedPhone = data.phone.startsWith('+')
      ? '+' + data.phone.slice(1).replace(/\D/g, '')
      : data.phone.replace(/\D/g, '');

    const existing = await prisma.user.findUnique({ where: { tenantId_phone: { tenantId: tenant.id, phone: normalizedPhone } } });
    if (existing) {
      // Return session for existing user so register page can show wallet buttons
      const { accessToken } = await createSession(existing.id, existing.role, tenant.id);
      return NextResponse.json({
        error: 'Este teléfono ya está registrado',
        accessToken,
        user: { id: existing.id, name: existing.name, role: existing.role },
      }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: data.name,
          phone: normalizedPhone,
          birthDate: new Date(data.birthDate + 'T00:00:00'),
          role: 'CUSTOMER',
        },
      });

      const card = await tx.loyaltyCard.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          cardNumber: generateCardNumber(tenant.cardPrefix),
          qrToken: randomBytes(16).toString('hex'),
          visitsThisCycle: 0,
          totalVisits: 0,
        },
      });

      return { user, card };
    });

    // Return session token directly — no separate login needed
    const { accessToken } = await createSession(result.user.id, result.user.role, tenant.id);

    return NextResponse.json({
      userId: result.user.id,
      cardId: result.card.id,
      cardNumber: result.card.cardNumber,
      accessToken,
      user: { id: result.user.id, name: result.user.name, role: result.user.role },
      message: `¡Bienvenido a ${tenant.name}!`,
    }, { status: 201 });

  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
    console.error('[Register]', err);
    return NextResponse.json({ error: 'Error al registrar' }, { status: 500 });
  }
}
