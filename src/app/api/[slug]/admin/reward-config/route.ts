import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTenant } from '@/lib/tenant';
import { sendApplePushUpdateForTenant } from '@/lib/push-apple';

const UpdateRewardSchema = z.object({
  visitsRequired: z.number().int().min(1).max(100),
  rewardName: z.string().min(2).max(100),
  rewardDescription: z.string().max(300).optional(),
  rewardCostCentavos: z.number().int().min(0).max(1000000).optional(),
});

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await requireAuth(['STAFF', 'ADMIN'])(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (user.tenantId !== tenant.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const [active, history] = await Promise.all([
    prisma.rewardConfig.findFirst({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { activatedAt: 'desc' },
    }),
    prisma.rewardConfig.findMany({
      where: { tenantId: tenant.id, isActive: false },
      orderBy: { activatedAt: 'desc' },
      take: 10,
    }),
  ]);

  return NextResponse.json({ active, history });
}

export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await requireAuth(['ADMIN'])(req);
  if (!user) return NextResponse.json({ error: 'Solo administradores pueden cambiar recompensas' }, { status: 403 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (user.tenantId !== tenant.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  try {
    const body = await req.json();
    const data = UpdateRewardSchema.parse(body);

    const newConfig = await prisma.$transaction(async (tx) => {
      await tx.rewardConfig.updateMany({
        where: { tenantId: tenant.id, isActive: true },
        data: { isActive: false },
      });

      const config = await tx.rewardConfig.create({
        data: {
          tenantId: tenant.id,
          visitsRequired: data.visitsRequired,
          rewardName: data.rewardName,
          rewardDescription: data.rewardDescription,
          rewardCostCentavos: data.rewardCostCentavos ?? 0,
          isActive: true,
        },
      });

      // Touch all loyalty cards so Apple's "passesUpdatedSince" check
      // sees them as changed and fetches the updated pass content
      await tx.loyaltyCard.updateMany({
        where: { tenantId: tenant.id, applePassSerial: { not: null } },
        data: { updatedAt: new Date() },
      });

      return config;
    });

    // Push update to all wallet passes so reward name refreshes
    sendApplePushUpdateForTenant(tenant.id).catch((err) =>
      console.error('[reward-config] Push update failed:', err)
    );

    return NextResponse.json({ newConfig });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
    console.error('[reward-config PUT]', err);
    const message = err instanceof Error ? err.message : 'Error al actualizar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
