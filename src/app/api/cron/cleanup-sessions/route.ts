import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  // Verify Vercel Cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  console.log(`[Cron] Cleaned up ${result.count} expired sessions`);
  return NextResponse.json({ deleted: result.count });
}
