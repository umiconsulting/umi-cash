import { NextResponse } from 'next/server';
import { prisma } from './prisma';

export async function getTenant(slug: string) {
  return prisma.tenant.findUnique({
    where: { slug },
    include: { locations: { where: { isActive: true } } },
  });
}

export type TenantWithLocations = NonNullable<Awaited<ReturnType<typeof getTenant>>>;

/** Returns a 402 response if the tenant subscription is suspended or the trial has expired, otherwise null. */
export function requireActiveSubscription(
  tenant: { id?: string; subscriptionStatus: string; trialEndsAt?: Date | null }
): NextResponse | null {
  if (tenant.subscriptionStatus === 'SUSPENDED') {
    return NextResponse.json(
      { error: 'Servicio suspendido. Contacta a tu administrador de Umi Cash.' },
      { status: 402 }
    );
  }
  if (tenant.subscriptionStatus === 'TRIAL' && tenant.trialEndsAt && tenant.trialEndsAt < new Date()) {
    // Auto-suspend the tenant asynchronously (fire-and-forget) when we have an id
    if (tenant.id) {
      prisma.tenant.update({
        where: { id: tenant.id },
        data: { subscriptionStatus: 'SUSPENDED', suspendedAt: new Date() },
      }).catch(() => {/* ignore */});
    }
    return NextResponse.json(
      { error: 'Tu período de prueba ha terminado. Contacta a Umi Cash para activar tu cuenta.' },
      { status: 402 }
    );
  }
  return null;
}
