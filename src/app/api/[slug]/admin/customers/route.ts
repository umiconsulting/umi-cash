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

  const purchaseInclude = {
    visits: { orderBy: { scannedAt: 'desc' as const }, take: 1 },
    transactions: { where: { type: 'PURCHASE' as const }, select: { amountCentavos: true } },
  };

  function toCustomer(u: { id: string; name: string | null; phone: string | null; email: string | null; createdAt: Date; card: { id: string; cardNumber: string; balanceCentavos: number; totalVisits: number; visitsThisCycle: number; pendingRewards: number; visits: { scannedAt: Date }[]; transactions: { amountCentavos: number }[] } | null }) {
    const ltvCentavos = (u.card?.transactions ?? []).reduce((sum, t) => sum + Math.abs(t.amountCentavos), 0);
    return {
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
      ltvCentavos,
      ltvMXN: formatMXN(ltvCentavos),
    };
  }

  // Sorts that require fetching all records and sorting in JS
  if (sort === 'inactive' || sort === 'ltv') {
    const [allUsers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { card: { include: purchaseInclude } },
      }),
      prisma.user.count({ where }),
    ]);

    if (sort === 'inactive') {
      allUsers.sort((a, b) => {
        const aDate = a.card?.visits[0]?.scannedAt ?? null;
        const bDate = b.card?.visits[0]?.scannedAt ?? null;
        if (!aDate && !bDate) return 0;
        if (!aDate) return -1;
        if (!bDate) return 1;
        return aDate.getTime() - bDate.getTime();
      });
    } else {
      // ltv: highest spenders first
      allUsers.sort((a, b) => {
        const aLtv = (a.card?.transactions ?? []).reduce((s, t) => s + Math.abs(t.amountCentavos), 0);
        const bLtv = (b.card?.transactions ?? []).reduce((s, t) => s + Math.abs(t.amountCentavos), 0);
        return bLtv - aLtv;
      });
    }

    const customers = allUsers.slice(skip, skip + limit).map(toCustomer);
    return NextResponse.json({ customers, total, page, totalPages: Math.ceil(total / limit) });
  }

  const orderBy =
    sort === 'visits' ? { card: { totalVisits: 'desc' as const } }
    : sort === 'balance' ? { card: { balanceCentavos: 'desc' as const } }
    : { createdAt: 'desc' as const };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { card: { include: purchaseInclude } },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ customers: users.map(toCustomer), total, page, totalPages: Math.ceil(total / limit) });
}
