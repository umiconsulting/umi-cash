import { waitUntil } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTenant } from '@/lib/tenant';
import { sendApplePushUpdateForTenant } from '@/lib/push-apple';

const SettingsSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  city: z.string().max(100).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido').optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido').optional().or(z.literal('')),
  logoUrl: z.string().max(500).optional().or(z.literal('')),
  stripImageUrl: z.string().max(500).optional().or(z.literal('')),
  passStyle: z.enum(['default', 'stamps']).optional(),
  promoMessage: z.string().max(200).optional().or(z.literal('')),
  selfRegistration: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await requireAuth(['ADMIN'])(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (user.tenantId !== tenant.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  return NextResponse.json({
    name: tenant.name,
    city: tenant.city,
    primaryColor: tenant.primaryColor,
    secondaryColor: tenant.secondaryColor,
    logoUrl: tenant.logoUrl,
    stripImageUrl: tenant.stripImageUrl,
    passStyle: tenant.passStyle,
    promoMessage: tenant.promoMessage,
    selfRegistration: tenant.selfRegistration,
    cardPrefix: tenant.cardPrefix,
    slug: tenant.slug,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await requireAuth(['ADMIN'])(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (user.tenantId !== tenant.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  try {
    const body = await req.json();
    const data = SettingsSchema.parse(body);

    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
        ...(data.secondaryColor !== undefined && { secondaryColor: data.secondaryColor || null }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl || null }),
        ...(data.stripImageUrl !== undefined && { stripImageUrl: data.stripImageUrl || null }),
        ...(data.passStyle !== undefined && { passStyle: data.passStyle }),
        ...(data.promoMessage !== undefined && { promoMessage: data.promoMessage || null }),
        ...(data.selfRegistration !== undefined && { selfRegistration: data.selfRegistration }),
      },
    });

    // If promo message changed, bump cards and push to all wallets
    if (data.promoMessage !== undefined && data.promoMessage !== tenant.promoMessage) {
      await prisma.loyaltyCard.updateMany({
        where: { tenantId: tenant.id, applePassSerial: { not: null } },
        data: { updatedAt: new Date() },
      });
      waitUntil(
        sendApplePushUpdateForTenant(tenant.id).catch((err) =>
          console.error('[settings] Push update failed:', err)
        )
      );
    }

    return NextResponse.json({ ok: true, tenant: { name: updated.name, primaryColor: updated.primaryColor } });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
  }
}
