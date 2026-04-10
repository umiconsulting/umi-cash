import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendApplePushUpdate } from '@/lib/push-apple';

/**
 * POST /api/umi/push-passes
 * Trigger Apple Wallet push updates for specific cards or entire tenants.
 * Auth: Bearer CRON_SECRET
 *
 * Body: { cardIds?: string[], tenantSlugs?: string[] }
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { cardIds, tenantSlugs } = body as { cardIds?: string[]; tenantSlugs?: string[] };

  const targetCardIds: string[] = [];

  // Collect cards by ID
  if (cardIds?.length) {
    targetCardIds.push(...cardIds);
  }

  // Collect cards by tenant slug
  if (tenantSlugs?.length) {
    const cards = await prisma.loyaltyCard.findMany({
      where: {
        tenant: { slug: { in: tenantSlugs } },
        applePassSerial: { not: null },
      },
      select: { id: true },
    });
    targetCardIds.push(...cards.map((c) => c.id));
  }

  if (targetCardIds.length === 0) {
    return NextResponse.json({ error: 'No cards found' }, { status: 404 });
  }

  // Bump updatedAt so Apple sees the pass as changed
  await prisma.loyaltyCard.updateMany({
    where: { id: { in: targetCardIds } },
    data: { updatedAt: new Date() },
  });

  let pushed = 0;
  for (const cardId of targetCardIds) {
    try {
      await sendApplePushUpdate(cardId);
      pushed++;
    } catch (err) {
      console.error(`[push-passes] Failed for ${cardId}:`, err);
    }
  }

  return NextResponse.json({ pushed, total: targetCardIds.length });
}
