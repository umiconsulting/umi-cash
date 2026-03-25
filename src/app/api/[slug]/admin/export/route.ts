import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatMXN } from '@/lib/currency';
import { getTenant } from '@/lib/tenant';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const staff = await requireAuth(['STAFF', 'ADMIN'])(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenant = await getTenant(params.slug);
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  if (staff.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id, role: 'CUSTOMER' },
    include: { card: { include: { _count: { select: { visits: true } } } } },
    orderBy: { createdAt: 'desc' },
  });

  const headers = ['Nombre', 'Teléfono', 'Email', 'Tarjeta', 'Saldo MXN', 'Visitas totales', 'Visitas ciclo', 'Recompensas pendientes', 'Registrado'];

  function escapeCsv(value: string | null | undefined): string {
    const str = value ?? '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const rows = users.map((u) => [
    escapeCsv(u.name),
    escapeCsv(u.phone),
    escapeCsv(u.email),
    escapeCsv(u.card?.cardNumber ?? ''),
    escapeCsv(formatMXN(u.card?.balanceCentavos ?? 0)),
    String(u.card?._count?.visits ?? 0),
    String(u.card?.visitsThisCycle ?? 0),
    String(u.card?.pendingRewards ?? 0),
    escapeCsv(u.createdAt.toLocaleDateString('es-MX')),
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');

  const date = new Date().toISOString().slice(0, 10);
  const filename = `clientes-${params.slug}-${date}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
