import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { verifyUmiSession } from '@/lib/umi-auth';
import { randomBytes } from 'crypto';

const CreateTenantSchema = z.object({
  slug: z.string().min(2).max(30).regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  name: z.string().min(2).max(100),
  city: z.string().max(100).optional(),
  cardPrefix: z.string().min(2).max(5).regex(/^[A-Z]+$/, 'Solo letras mayúsculas').transform(s => s.toUpperCase()),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido'),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido').optional(),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(100),
  visitsRequired: z.number().int().min(1).max(50).default(10),
  rewardName: z.string().min(2).max(100).default('Bebida gratis'),
  trialEndsAt: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  if (!await verifyUmiSession(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = CreateTenantSchema.parse(body);

    // Check slug uniqueness
    const existing = await prisma.tenant.findUnique({ where: { slug: data.slug } });
    if (existing) return NextResponse.json({ error: 'Este slug ya existe' }, { status: 409 });

    const tenant = await prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          slug: data.slug,
          name: data.name,
          city: data.city,
          cardPrefix: data.cardPrefix,
          primaryColor: data.primaryColor,
          secondaryColor: data.secondaryColor,
          selfRegistration: true,
          ...(data.trialEndsAt
            ? {
                subscriptionStatus: 'TRIAL',
                trialEndsAt: new Date(data.trialEndsAt),
              }
            : {}),
        },
      });

      // Default reward config
      await tx.rewardConfig.create({
        data: {
          tenantId: newTenant.id,
          visitsRequired: data.visitsRequired,
          rewardName: data.rewardName,
          isActive: true,
        },
      });

      // Admin user
      await tx.user.create({
        data: {
          tenantId: newTenant.id,
          email: data.adminEmail,
          name: 'Admin',
          role: 'ADMIN',
          passwordHash: hashPassword(data.adminPassword),
        },
      });

      return newTenant;
    });

    return NextResponse.json({ ok: true, slug: tenant.slug }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
    console.error('[CreateTenant]', err);
    return NextResponse.json({ error: 'Error al crear tenant' }, { status: 500 });
  }
}
