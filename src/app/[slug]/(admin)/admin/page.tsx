'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface DashboardData {
  totalCustomers: number;
  activeReward: { rewardName: string; visitsRequired: number } | null;
  visitsToday: number;
  topupsTodayCount: number;
  topupsTodayMXN: string;
  pendingRewards: number;
}

export default function AdminDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    Promise.all([
      fetch(`/api/${slug}/admin/customers?limit=1`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`/api/${slug}/admin/reward-config`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`/api/${slug}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([customers, rewards, stats]) => {
        setData({
          totalCustomers: customers.total || 0,
          activeReward: rewards.active
            ? { rewardName: rewards.active.rewardName, visitsRequired: rewards.active.visitsRequired }
            : null,
          visitsToday: stats.visitsToday ?? 0,
          topupsTodayCount: stats.topupsTodayCount ?? 0,
          topupsTodayMXN: stats.topupsTodayMXN ?? '$0.00',
          pendingRewards: stats.pendingRewards ?? 0,
        });
      })
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      const t = localStorage.getItem('accessToken');
      if (!t) return;
      fetch(`/api/${slug}/admin/stats`, { headers: { Authorization: `Bearer ${t}` } })
        .then((r) => r.json())
        .then((stats) => {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  visitsToday: stats.visitsToday ?? prev.visitsToday,
                  topupsTodayMXN: stats.topupsTodayMXN ?? prev.topupsTodayMXN,
                  pendingRewards: stats.pendingRewards ?? prev.pendingRewards,
                }
              : prev
          );
        })
        .catch(() => {/* ignore refresh errors */});
    }, 30_000);

    return () => clearInterval(interval);
  }, [slug]);

  const fmt = (n: number | undefined) => (loading ? '...' : String(n ?? 0));

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-bold text-coffee-dark mt-4 mb-6">Panel de control</h1>

      {/* Today's metrics */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card-surface text-center">
          <p className="text-2xl font-bold text-coffee-dark">{fmt(data?.visitsToday)}</p>
          <p className="text-xs text-coffee-medium mt-0.5">Visitas hoy</p>
        </div>
        <div className="card-surface text-center">
          <p className="text-2xl font-bold text-coffee-dark">{loading ? '...' : (data?.topupsTodayMXN ?? '$0.00')}</p>
          <p className="text-xs text-coffee-medium mt-0.5">Recargado hoy</p>
        </div>
        <div className="card-surface text-center">
          <p className={`text-2xl font-bold ${data?.pendingRewards ? 'text-coffee-brand' : 'text-coffee-dark'}`}>
            {fmt(data?.pendingRewards)}
          </p>
          <p className="text-xs text-coffee-medium mt-0.5">Por canjear</p>
        </div>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href={`/${slug}/admin/scan`} className="card-surface hover:shadow-md transition-shadow">
          <p className="font-semibold text-coffee-dark">Escanear QR</p>
          <p className="text-xs text-coffee-medium mt-1">Registrar visita</p>
        </Link>
        <Link href={`/${slug}/admin/topup`} className="card-surface hover:shadow-md transition-shadow">
          <p className="font-semibold text-coffee-dark">Recargar saldo</p>
          <p className="text-xs text-coffee-medium mt-1">Agregar saldo regalo</p>
        </Link>
        <Link href={`/${slug}/admin/customers`} className="card-surface hover:shadow-md transition-shadow">
          <p className="font-semibold text-coffee-dark">Clientes</p>
          <p className="text-xs text-coffee-medium mt-1">
            {loading ? '...' : `${data?.totalCustomers ?? 0} registrados`}
          </p>
        </Link>
        <Link href={`/${slug}/admin/rewards`} className="card-surface hover:shadow-md transition-shadow">
          <p className="font-semibold text-coffee-dark">Recompensas</p>
          <p className="text-xs text-coffee-medium mt-1">Configurar</p>
        </Link>
      </div>

      {data?.activeReward && (
        <div className="card-surface mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-coffee-medium uppercase tracking-wide font-semibold">Recompensa activa</p>
              <p className="font-bold text-coffee-dark mt-1">{data.activeReward.rewardName}</p>
              <p className="text-sm text-coffee-medium">Cada {data.activeReward.visitsRequired} visitas</p>
            </div>
            <Link href={`/${slug}/admin/rewards`} className="text-sm text-coffee-medium underline">Cambiar</Link>
          </div>
        </div>
      )}

      <div className="bg-coffee-pale rounded-xl p-4 text-sm text-coffee-medium">
        <p className="font-semibold text-coffee-dark mb-1">Para registrar una visita</p>
        <p>Ve a <strong>Escanear QR</strong> y pídele al cliente que muestre su código desde el teléfono.</p>
      </div>
    </div>
  );
}
