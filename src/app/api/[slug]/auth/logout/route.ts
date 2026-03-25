import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refreshToken')?.value;
  if (refreshToken) {
    await prisma.session.deleteMany({ where: { token: refreshToken } }).catch(() => null);
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete('refreshToken');
  return response;
}
