'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMXN } from '@/lib/currency';

interface DashboardStats {
  totalCustomers: number;
  activeReward: {
    rewardName: string;
    visitsRequired: number;
  } | null;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    Promise.all([
      fetch('/api/admin/customers?limit=1', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
      fetch('/api/admin/reward-config', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
    ])
      .then(([customers, rewards]) => {
        setStats({
          totalCustomers: customers.total || 0,
          activeReward: rewards.active
            ? { rewardName: rewards.active.rewardName, visitsRequired: rewards.active.visitsRequired }
            : null,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-bold text-coffee-dark mt-4 mb-6">
        Panel de control
      </h1>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href="/admin/scan" className="card-surface hover:shadow-md transition-shadow">
          <p className="font-semibold text-coffee-dark">Escanear QR</p>
          <p className="text-xs text-coffee-medium mt-1">Registrar visita</p>
        </Link>
        <Link href="/admin/topup" className="card-surface hover:shadow-md transition-shadow">
          <p className="font-semibold text-coffee-dark">Recargar saldo</p>
          <p className="text-xs text-coffee-medium mt-1">Agregar saldo regalo</p>
        </Link>
        <Link href="/admin/customers" className="card-surface hover:shadow-md transition-shadow">
          <p className="font-semibold text-coffee-dark">Clientes</p>
          <p className="text-xs text-coffee-medium mt-1">
            {loading ? '...' : `${stats?.totalCustomers ?? 0} registrados`}
          </p>
        </Link>
        <Link href="/admin/rewards" className="card-surface hover:shadow-md transition-shadow">
          <p className="font-semibold text-coffee-dark">Recompensas</p>
          <p className="text-xs text-coffee-medium mt-1">Configurar</p>
        </Link>
      </div>

      {stats?.activeReward && (
        <div className="card-surface mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-coffee-medium uppercase tracking-wide font-semibold">
                Recompensa activa
              </p>
              <p className="font-bold text-coffee-dark mt-1">{stats.activeReward.rewardName}</p>
              <p className="text-sm text-coffee-medium">Cada {stats.activeReward.visitsRequired} visitas</p>
            </div>
            <Link href="/admin/rewards" className="text-sm text-coffee-medium underline">
              Cambiar
            </Link>
          </div>
        </div>
      )}

      <div className="bg-coffee-pale rounded-xl p-4 text-sm text-coffee-medium">
        <p className="font-semibold text-coffee-dark mb-1">Para registrar una visita</p>
        <p>
          Ve a <strong>Escanear QR</strong> y pídele al cliente que muestre su código desde el teléfono.
        </p>
      </div>
    </div>
  );
}
