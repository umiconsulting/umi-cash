import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAccessToken, verifyRefreshToken } from '@/lib/auth';
import { getTenant } from '@/lib/tenant';

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const refreshToken = req.cookies.get('refreshToken')?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  const [session, tenant] = await Promise.all([
    prisma.session.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    }),
    getTenant(params.slug),
  ]);

  if (!session || session.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 });
  }

  // Enforce tenant isolation — token must belong to this tenant's slug
  if (!tenant || session.user.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const accessToken = await signAccessToken(session.user.id, session.user.role, session.user.tenantId);
  return NextResponse.json({ accessToken });
}
