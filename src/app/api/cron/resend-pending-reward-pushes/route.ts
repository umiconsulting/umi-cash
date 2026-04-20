import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendApplePushUpdate } from '@/lib/push-apple';

/**
 * One-off admin trigger: re-push the wallet pass for every card in the
 * given tenant that has pendingRewards > 0. Useful after APN key rotation
 * to verify prod can reach Apple end-to-end.
 *
 * GET /api/cron/resend-pending-reward-pushes?slug=elgranribera
 * Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Missing ?slug' }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const cards = await prisma.loyaltyCard.findMany({
    where: {
      tenantId: tenant.id,
      pendingRewards: { gt: 0 },
      applePassSerial: { not: null },
    },
    select: { id: true, cardNumber: true, pendingRewards: true },
  });

  const results: Array<{ cardNumber: string; pendingRewards: number; pushed: boolean }> = [];
  for (const card of cards) {
    try {
      await prisma.loyaltyCard.update({
        where: { id: card.id },
        data: { updatedAt: new Date() },
      });
      await sendApplePushUpdate(card.id);
      results.push({ cardNumber: card.cardNumber, pendingRewards: card.pendingRewards, pushed: true });
    } catch (err) {
      console.error(`[ResendPush] card ${card.id}`, err);
      results.push({ cardNumber: card.cardNumber, pendingRewards: card.pendingRewards, pushed: false });
    }
  }

  return NextResponse.json({ slug, tenantId: tenant.id, cardsFound: cards.length, results });
}
