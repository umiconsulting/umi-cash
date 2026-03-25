import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatMXN } from '@/lib/currency';
import { getTenant } from '@/lib/tenant';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await requireAuth(['STAFF', 'ADMIN'])(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (user.tenantId !== tenant.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1);
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '20') || 20, 100));
  const search = (url.searchParams.get('search') || '').trim().slice(0, 50);
  const sort = url.searchParams.get('sort') || 'recent';
  const skip = (page - 1) * limit;

  const where = search
    ? {
        tenantId: tenant.id,
        role: 'CUSTOMER',
        OR: [
          { name: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search } },
          { card: { cardNumber: { contains: search } } },
        ],
      }
    : { tenantId: tenant.id, role: 'CUSTOMER' };

  // For inactive sort we fetch all and sort in application code (no DB column for last visit)
  if (sort === 'inactive') {
    const [allUsers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { card: { include: { visits: { orderBy: { scannedAt: 'desc' }, take: 1 } } } },
      }),
      prisma.user.count({ where }),
    ]);

    // Sort: null lastVisit first (never visited), then oldest visit first
    allUsers.sort((a, b) => {
      const aDate = a.card?.visits[0]?.scannedAt ?? null;
      const bDate = b.card?.visits[0]?.scannedAt ?? null;
      if (!aDate && !bDate) return 0;
      if (!aDate) return -1;
      if (!bDate) return 1;
      return aDate.getTime() - bDate.getTime();
    });

    const paged = allUsers.slice(skip, skip + limit);

    const customers = paged.map((u) => ({
      id: u.id, name: u.name, phone: u.phone, email: u.email,
      cardNumber: u.card?.cardNumber ?? '',
      cardId: u.card?.id ?? '',
      balanceMXN: formatMXN(u.card?.balanceCentavos ?? 0),
      balanceCentavos: u.card?.balanceCentavos ?? 0,
      totalVisits: u.card?.totalVisits ?? 0,
      visitsThisCycle: u.card?.visitsThisCycle ?? 0,
      pendingRewards: u.card?.pendingRewards ?? 0,
      lastVisit: u.card?.visits[0]?.scannedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json({ customers, total, page, totalPages: Math.ceil(total / limit) });
  }

  const orderBy =
    sort === 'visits' ? { card: { totalVisits: 'desc' as const } }
    : sort === 'balance' ? { card: { balanceCentavos: 'desc' as const } }
    : { createdAt: 'desc' as const };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { card: { include: { visits: { orderBy: { scannedAt: 'desc' }, take: 1 } } } },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const customers = users.map((u) => ({
    id: u.id, name: u.name, phone: u.phone, email: u.email,
    cardNumber: u.card?.cardNumber ?? '',
    cardId: u.card?.id ?? '',
    balanceMXN: formatMXN(u.card?.balanceCentavos ?? 0),
    balanceCentavos: u.card?.balanceCentavos ?? 0,
    totalVisits: u.card?.totalVisits ?? 0,
    visitsThisCycle: u.card?.visitsThisCycle ?? 0,
    pendingRewards: u.card?.pendingRewards ?? 0,
    lastVisit: u.card?.visits[0]?.scannedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }));

  return NextResponse.json({ customers, total, page, totalPages: Math.ceil(total / limit) });
}
