import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createSession, verifyPassword } from '@/lib/auth';
import { getTenant } from '@/lib/tenant';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const LoginSchema = z.object({
  identifier: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
  role: z.enum(['STAFF', 'ADMIN']),
});

function setRefreshCookie(response: NextResponse, refreshToken: string, slug: string) {
  response.cookies.set('refreshToken', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60,
    path: `/${slug}`,
  });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`login:${params.slug}:${ip}`, 10, 15 * 60 * 1000); // 10 per 15 min
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  try {
    const body = await req.json();
    const { identifier, password, role } = LoginSchema.parse(body);

    // Per-account lockout: 5 failed attempts per email per 15 min (prevents distributed brute force)
    const accountRl = rateLimit(`login-account:${params.slug}:${identifier.toLowerCase()}`, 5, 15 * 60 * 1000);
    if (!accountRl.allowed) return rateLimitResponse(accountRl.resetAt);

    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, email: identifier, role },
    });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }
    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }
    const { accessToken, refreshToken } = await createSession(user.id, user.role, tenant.id);
    const response = NextResponse.json({
      accessToken,
      user: { id: user.id, name: user.name, role: user.role, email: user.email },
    });
    setRefreshCookie(response, refreshToken, params.slug);
    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    console.error('[Login]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
