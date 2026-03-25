import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyUmiSession } from '@/lib/umi-auth';

const UpdateTenantSchema = z.object({
  subscriptionStatus: z.enum(['ACTIVE', 'SUSPENDED', 'TRIAL']).optional(),
  trialEndsAt: z.string().datetime().optional().nullable(),
  name: z.string().min(2).max(100).optional(),
  city: z.string().max(100).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido').optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  selfRegistration: z.boolean().optional(),
  rewardName: z.string().min(2).max(100).optional(),
  visitsRequired: z.number().int().min(1).max(50).optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await verifyUmiSession(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      rewardConfigs: { where: { isActive: true }, take: 1 },
    },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  return NextResponse.json({
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    city: tenant.city,
    primaryColor: tenant.primaryColor,
    secondaryColor: tenant.secondaryColor,
    cardPrefix: tenant.cardPrefix,
    selfRegistration: tenant.selfRegistration,
    subscriptionStatus: tenant.subscriptionStatus,
    trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
    rewardConfig: tenant.rewardConfigs[0]
      ? { visitsRequired: tenant.rewardConfigs[0].visitsRequired, rewardName: tenant.rewardConfigs[0].rewardName }
      : null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await verifyUmiSession(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = UpdateTenantSchema.parse(body);

    const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

    const updated = await prisma.tenant.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.city !== undefined && { city: data.city || null }),
        ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
        ...(data.secondaryColor !== undefined && { secondaryColor: data.secondaryColor }),
        ...(data.selfRegistration !== undefined && { selfRegistration: data.selfRegistration }),
        ...(data.subscriptionStatus !== undefined && {
          subscriptionStatus: data.subscriptionStatus,
          suspendedAt: data.subscriptionStatus === 'SUSPENDED' ? new Date() : null,
          trialEndsAt: data.subscriptionStatus !== 'TRIAL' ? null : undefined,
        }),
        ...(data.trialEndsAt !== undefined && { trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : null }),
      },
      select: { id: true, slug: true, name: true, subscriptionStatus: true, suspendedAt: true },
    });

    // Update active reward config if reward fields provided
    if (data.rewardName !== undefined || data.visitsRequired !== undefined) {
      const activeConfig = await prisma.rewardConfig.findFirst({
        where: { tenantId: params.id, isActive: true },
      });
      if (activeConfig) {
        await prisma.rewardConfig.update({
          where: { id: activeConfig.id },
          data: {
            ...(data.rewardName !== undefined && { rewardName: data.rewardName }),
            ...(data.visitsRequired !== undefined && { visitsRequired: data.visitsRequired }),
          },
        });
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
    console.error('[UpdateTenant]', String(err));
    return NextResponse.json({ error: 'Error al actualizar tenant' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await verifyUmiSession(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    const cards = await tx.loyaltyCard.findMany({ where: { tenantId: params.id }, select: { id: true } });
    const cardIds = cards.map((c) => c.id);

    if (cardIds.length > 0) {
      await tx.applePushToken.deleteMany({ where: { cardId: { in: cardIds } } });
      await tx.rewardRedemption.deleteMany({ where: { cardId: { in: cardIds } } });
      await tx.visit.deleteMany({ where: { cardId: { in: cardIds } } });
      await tx.transaction.deleteMany({ where: { cardId: { in: cardIds } } });
      await tx.loyaltyCard.deleteMany({ where: { tenantId: params.id } });
    }

    const users = await tx.user.findMany({ where: { tenantId: params.id }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await tx.session.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { tenantId: params.id } });
    }

    await tx.rewardConfig.deleteMany({ where: { tenantId: params.id } });
    await tx.location.deleteMany({ where: { tenantId: params.id } });
    await tx.tenant.delete({ where: { id: params.id } });
  });

  return NextResponse.json({ ok: true });
}
