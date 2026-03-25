import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUmiAdmin } from '@/lib/umi-auth';
import { LogoutButton } from './_components/LogoutButton';
import { TenantRow } from './_components/TenantRow';

export const dynamic = 'force-dynamic';

export default async function UmiMasterAdmin() {
  await requireUmiAdmin();

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { users: true, cards: true } },
      rewardConfigs: {
        where: { isActive: true },
        take: 1,
      },
    },
  });

  const totalUsers = tenants.reduce((sum, t) => sum + t._count.users, 0);
  const totalCards = tenants.reduce((sum, t) => sum + t._count.cards, 0);
  const activeCount = tenants.filter((t) => t.subscriptionStatus === 'ACTIVE').length;
  const suspendedCount = tenants.filter((t) => t.subscriptionStatus === 'SUSPENDED').length;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-gray-600 text-sm transition-colors">
              ← Umi Cash
            </Link>
            <span className="text-gray-200">/</span>
            <p className="font-semibold text-gray-900">Master Admin</p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Stats summary */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Cafeterías', value: tenants.length },
            { label: 'Activas', value: activeCount },
            { label: 'Suspendidas', value: suspendedCount },
            { label: 'Usuarios totales', value: totalUsers },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-sm text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tenant table */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Cafeterías</h2>
          <Link href="/umi/admin/new" className="text-sm bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-700 transition-colors">
            + Nueva cafetería
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Negocio</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Slug / Prefijo</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Usuarios</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Tarjetas</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tenants.map((tenant) => {
                let trialDaysRemaining: number | null = null;
                if (tenant.subscriptionStatus === 'TRIAL' && tenant.trialEndsAt) {
                  const msRemaining = tenant.trialEndsAt.getTime() - Date.now();
                  trialDaysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
                }
                return (
                  <TenantRow key={tenant.id} tenant={tenant} trialDaysRemaining={trialDaysRemaining} />
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-4 text-center">
          MRR estimado: <span className="font-semibold text-gray-600">${(activeCount * 350).toLocaleString('es-MX')} MXN/mes</span>
          {' '}· {activeCount} cliente{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''} × $350
        </p>
      </div>
    </main>
  );
}
