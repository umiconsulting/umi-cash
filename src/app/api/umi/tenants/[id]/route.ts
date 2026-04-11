import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyUmiSession } from '@/lib/umi-auth';
import { sendApplePushUpdateForTenant } from '@/lib/push-apple';
import { find as findTimezone } from 'geo-tz';

const LocationUpdateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  address: z.string().max(200).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isActive: z.boolean().optional(),
});

const UpdateTenantSchema = z.object({
  subscriptionStatus: z.enum(['ACTIVE', 'SUSPENDED', 'TRIAL']).optional(),
  trialEndsAt: z.string().datetime().optional().nullable(),
  name: z.string().min(2).max(100).optional(),
  city: z.string().max(100).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido').optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  selfRegistration: z.boolean().optional(),
  topupEnabled: z.boolean().optional(),
  openHour: z.number().int().min(0).max(23).optional().nullable(),
  closeHour: z.number().int().min(0).max(23).optional().nullable(),
  // timezone is auto-derived from location coordinates — not manually settable
  rewardName: z.string().min(2).max(100).optional(),
  visitsRequired: z.number().int().min(1).max(50).optional(),
  locations: z.array(LocationUpdateSchema).optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await verifyUmiSession(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      rewardConfigs: { where: { isActive: true }, take: 1 },
      locations: { orderBy: { name: 'asc' } },
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
    topupEnabled: tenant.topupEnabled,
    openHour: tenant.openHour,
    closeHour: tenant.closeHour,
    timezone: tenant.timezone,
    subscriptionStatus: tenant.subscriptionStatus,
    trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
    rewardConfig: tenant.rewardConfigs[0]
      ? { visitsRequired: tenant.rewardConfigs[0].visitsRequired, rewardName: tenant.rewardConfigs[0].rewardName }
      : null,
    locations: tenant.locations.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      latitude: l.latitude,
      longitude: l.longitude,
      isActive: l.isActive,
    })),
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
        ...(data.topupEnabled !== undefined && { topupEnabled: data.topupEnabled }),
        ...(data.openHour !== undefined && { openHour: data.openHour }),
        ...(data.closeHour !== undefined && { closeHour: data.closeHour }),
        ...(data.subscriptionStatus !== undefined && {
          subscriptionStatus: data.subscriptionStatus,
          suspendedAt: data.subscriptionStatus === 'SUSPENDED' ? new Date() : null,
          trialEndsAt: data.subscriptionStatus !== 'TRIAL' ? null : undefined,
        }),
        ...(data.trialEndsAt !== undefined && { trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : null }),
      },
      select: { id: true, slug: true, name: true, subscriptionStatus: true, suspendedAt: true },
    });

    // Update locations if provided
    if (data.locations !== undefined) {
      const existingLocations = await prisma.location.findMany({ where: { tenantId: params.id } });
      const existingIds = existingLocations.map((l) => l.id);
      const incomingIds = data.locations.filter((l) => l.id).map((l) => l.id!);

      // Delete removed locations
      const toDelete = existingIds.filter((id) => !incomingIds.includes(id));
      if (toDelete.length > 0) {
        await prisma.location.deleteMany({ where: { id: { in: toDelete } } });
      }

      // Upsert locations
      for (const loc of data.locations) {
        if (loc.id && existingIds.includes(loc.id)) {
          await prisma.location.update({
            where: { id: loc.id },
            data: {
              name: loc.name,
              address: loc.address ?? null,
              latitude: loc.latitude ?? null,
              longitude: loc.longitude ?? null,
              isActive: loc.isActive ?? true,
            },
          });
        } else {
          await prisma.location.create({
            data: {
              tenantId: params.id,
              name: loc.name,
              address: loc.address ?? null,
              latitude: loc.latitude ?? null,
              longitude: loc.longitude ?? null,
              isActive: true,
            },
          });
        }
      }

      // Auto-derive timezone from first location with coordinates
      const firstLocWithCoords = data.locations.find((l) => l.latitude != null && l.longitude != null);
      if (firstLocWithCoords && firstLocWithCoords.latitude != null && firstLocWithCoords.longitude != null) {
        const tzResults = findTimezone(firstLocWithCoords.latitude, firstLocWithCoords.longitude);
        if (tzResults.length > 0) {
          await prisma.tenant.update({
            where: { id: params.id },
            data: { timezone: tzResults[0] },
          });
        }
      }
    }

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

        // Bump card timestamps + push wallet updates
        await prisma.loyaltyCard.updateMany({
          where: { tenantId: params.id, applePassSerial: { not: null } },
          data: { updatedAt: new Date() },
        });
        sendApplePushUpdateForTenant(params.id).catch((err) =>
          console.error('[umi-admin] Push update failed:', err)
        );
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
