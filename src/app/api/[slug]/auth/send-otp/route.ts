import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getTenant } from '@/lib/tenant';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { generateOTP, hashOTP } from '@/lib/otp';
import { sendSMS, isTwilioConfigured } from '@/lib/twilio';

const SendOtpSchema = z.object({
  phone: z.string().min(7).max(20),
});

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: 'SMS no configurado' }, { status: 503 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limit: 3 OTP sends per IP per 10 min
  const ipRl = rateLimit(`otp-send-ip:${ip}`, 3, 10 * 60 * 1000);
  if (!ipRl.allowed) return rateLimitResponse(ipRl.resetAt);

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  try {
    const body = await req.json();
    const { phone } = SendOtpSchema.parse(body);

    // Normalize phone to E.164
    const normalizedPhone = phone.startsWith('+')
      ? '+' + phone.slice(1).replace(/\D/g, '')
      : phone.replace(/\D/g, '');

    // Rate limit: 3 OTP sends per phone per 10 min
    const phoneRl = rateLimit(`otp-send-phone:${normalizedPhone}`, 3, 10 * 60 * 1000);
    if (!phoneRl.allowed) return rateLimitResponse(phoneRl.resetAt);

    // Invalidate any existing unused OTPs for this phone+tenant
    await prisma.otpVerification.updateMany({
      where: { phone: normalizedPhone, tenantId: tenant.id, verified: false },
      data: { expiresAt: new Date(0) },
    });

    // Generate and store hashed code
    const code = generateOTP();
    await prisma.otpVerification.create({
      data: {
        phone: normalizedPhone,
        tenantId: tenant.id,
        codeHash: hashOTP(code),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    // Send SMS
    const result = await sendSMS(
      normalizedPhone,
      `Tu código de verificación es: ${code}. Válido por 5 minutos.`
    );

    if (!result.ok) {
      console.error('[send-otp] SMS failed:', result.error);
      return NextResponse.json({ error: 'No se pudo enviar el SMS' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
    console.error('[send-otp]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error al enviar código' }, { status: 500 });
  }
}
