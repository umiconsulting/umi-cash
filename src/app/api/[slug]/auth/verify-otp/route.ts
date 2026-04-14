import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/prisma';
import { getTenant } from '@/lib/tenant';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { hashOTP } from '@/lib/otp';

const VERIFICATION_SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);

const VerifyOtpSchema = z.object({
  phone: z.string().min(7).max(20),
  code: z.string().length(6),
});

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limit: 5 verify attempts per IP per 10 min
  const ipRl = rateLimit(`otp-verify-ip:${ip}`, 5, 10 * 60 * 1000);
  if (!ipRl.allowed) return rateLimitResponse(ipRl.resetAt);

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  try {
    const body = await req.json();
    const { phone, code } = VerifyOtpSchema.parse(body);

    const normalizedPhone = phone.startsWith('+')
      ? '+' + phone.slice(1).replace(/\D/g, '')
      : phone.replace(/\D/g, '');

    // Rate limit per phone too
    const phoneRl = rateLimit(`otp-verify-phone:${normalizedPhone}`, 5, 10 * 60 * 1000);
    if (!phoneRl.allowed) return rateLimitResponse(phoneRl.resetAt);

    // Find latest non-expired, non-verified OTP
    const otp = await prisma.otpVerification.findFirst({
      where: {
        phone: normalizedPhone,
        tenantId: tenant.id,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return NextResponse.json({ error: 'Código expirado o no encontrado. Solicita uno nuevo.' }, { status: 400 });
    }

    // Check brute force (5 attempts max per code)
    if (otp.attempts >= 5) {
      return NextResponse.json({ error: 'Demasiados intentos. Solicita un nuevo código.' }, { status: 429 });
    }

    // Increment attempts
    await prisma.otpVerification.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    // Compare hashes
    if (hashOTP(code) !== otp.codeHash) {
      const remaining = 4 - otp.attempts; // already incremented
      return NextResponse.json({
        error: `Código incorrecto. ${remaining > 0 ? `${remaining} intento${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}.` : 'Solicita un nuevo código.'}`,
      }, { status: 400 });
    }

    // Mark as verified
    await prisma.otpVerification.update({
      where: { id: otp.id },
      data: { verified: true },
    });

    // Generate short-lived verification token (5 min)
    const verificationToken = await new SignJWT({
      phone: normalizedPhone,
      tenantId: tenant.id,
      purpose: 'phone-verification',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(VERIFICATION_SECRET);

    return NextResponse.json({ verified: true, verificationToken });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
    console.error('[verify-otp]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error al verificar código' }, { status: 500 });
  }
}
