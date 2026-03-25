import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createSession, verifyPassword } from '@/lib/auth';
import { USER_ROLES } from '@/lib/constants';
import { getTenant } from '@/lib/tenant';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const LoginSchema = z.object({
  identifier: z.string().min(1).max(200),
  password: z.string().max(200).optional(),
  role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).optional(),
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

    if (role === USER_ROLES.STAFF || role === USER_ROLES.ADMIN) {
      const user = await prisma.user.findFirst({
        where: { tenantId: tenant.id, email: identifier, role },
      });
      if (!user || !user.passwordHash || !password) {
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
    }

    // Customer: passwordless (phone or email)
    const isPhone = identifier.startsWith('+') || /^\d{10}$/.test(identifier);
    const user = await prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        role: USER_ROLES.CUSTOMER,
        ...(isPhone ? { phone: identifier } : { email: identifier }),
      },
    });
    // Return same error regardless of whether user exists to prevent enumeration
    if (!user) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }
    const { accessToken, refreshToken } = await createSession(user.id, user.role, tenant.id);
    const response = NextResponse.json({
      accessToken,
      user: { id: user.id, name: user.name, role: user.role, phone: user.phone },
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
