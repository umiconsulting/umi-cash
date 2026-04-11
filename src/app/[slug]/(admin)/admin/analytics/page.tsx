'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTenant } from '@/context/TenantContext';

interface VisitDay {
  date: string;
  count: number;
}

interface WeekEntry {
  week: string;
  count: number;
}

interface TopCustomer {
  id: string;
  name: string;
  cardNumber: string;
  totalVisits: number;
  balanceMXN: string;
}

interface Profitability {
  avgTicketMXN: string;
  revenuePerCycleMXN: string;
  rewardCostMXN: string;
  marginPerCycleMXN: string;
  marginPercent: number | null;
  visitsRequired: number;
  rewardCostConfigured: boolean;
}

interface AnalyticsData {
  visitsByDay: VisitDay[];
  topCustomers: TopCustomer[];
  newCustomersByWeek: WeekEntry[];
  totalBalance: string;
  topupsThisMonth: string;
  rewardsRedeemedThisMonth: number;
  avgVisitsPerCustomer: number;
  retentionRate: number;
  profitability: Profitability;
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-2xl p-4">
      <p className="text-xs text-coffee-medium leading-tight mb-1.5">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-coffee-brand' : 'text-coffee-dark'}`}>{value}</p>
      {sub && <p className="text-xs text-coffee-medium mt-0.5">{sub}</p>}
    </div>
  );
}

function LoadingKpi() {
  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="h-3 bg-coffee-pale rounded animate-pulse w-2/3 mb-2" />
      <div className="h-7 bg-coffee-pale rounded animate-pulse w-1/2" />
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-6 bg-coffee-pale rounded animate-pulse" />
      ))}
    </div>
  );
}

/** Vertical bar chart optimized for mobile — shows last 7 days prominently */
function VisitChart({ data, color }: { data: { label: string; sublabel: string; count: number }[]; color: string }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1" style={{ height: '140px' }}>
      {data.map((d, i) => {
        const heightPct = Math.max((d.count / maxCount) * 100, d.count > 0 ? 4 : 0);
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            {d.count > 0 && (
              <span className="text-[10px] font-semibold text-coffee-dark mb-1">{d.count}</span>
            )}
            <div
              className="w-full rounded-t-md transition-all duration-300"
              style={{ height: `${heightPct}%`, backgroundColor: color, minWidth: '4px' }}
            />
            <span className="text-[10px] text-coffee-medium mt-1.5 leading-none">{d.sublabel}</span>
            <span className="text-[9px] text-coffee-light leading-none">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal bar chart — best for mobile, easy to read labels and values */
function HorizontalBarChart({ data, color }: { data: { label: string; count: number }[]; color: string }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-coffee-medium">{d.label}</span>
            <span className="font-semibold text-coffee-dark">{d.count}</span>
          </div>
          <div className="w-full bg-coffee-pale/50 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.max((d.count / maxCount) * 100, d.count > 0 ? 4 : 0)}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { slug } = useParams<{ slug: string }>();
  const tenant = useTenant();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    fetch(`/api/${slug}/admin/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar analíticas');
        return r.json();
      })
      .then((d: AnalyticsData) => setData(d))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error desconocido'))
      .finally(() => setLoading(false));
  }, [slug]);

  const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Show last 14 days for the visit chart (fits well on mobile)
  const recentVisits = (data?.visitsByDay ?? []).slice(-14).map((v) => {
    const d = new Date(v.date + 'T00:00:00');
    return { label: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`, sublabel: DAY_NAMES[d.getDay()], count: v.count };
  });

  // Weeks chart data
  const weeksData = (data?.newCustomersByWeek ?? []).map((w) => ({ label: w.week, count: w.count }));

  const brandColor = tenant.primaryColor;

  // Summary stats for the visits
  const totalVisits30d = (data?.visitsByDay ?? []).reduce((sum, v) => sum + v.count, 0);
  const totalVisits7d = (data?.visitsByDay ?? []).slice(-7).reduce((sum, v) => sum + v.count, 0);

  return (
    <div className="p-4 max-w-lg mx-auto pb-24">
      <h1 className="font-display text-2xl font-bold text-coffee-dark mt-4 mb-6">Analíticas</h1>

      {error && (
        <div className="bg-red-50 text-red-700 rounded-xl p-3 mb-4 text-sm">{error}</div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {loading ? (
          <><LoadingKpi /><LoadingKpi /><LoadingKpi /><LoadingKpi /></>
        ) : (
          <>
            <KpiCard label="Visitas (30 días)" value={totalVisits30d} sub={`${totalVisits7d} esta semana`} />
            <KpiCard label="Tasa de retención" value={`${data?.retentionRate ?? 0}%`} sub={`${data?.avgVisitsPerCustomer ?? 0} vis/cliente`} />
            {tenant.topupEnabled && <KpiCard label="Saldo en circulación" value={data?.totalBalance ?? '$0.00'} />}
            <KpiCard label="Recompensas (mes)" value={data?.rewardsRedeemedThisMonth ?? 0} sub={tenant.topupEnabled && data?.topupsThisMonth ? `${data.topupsThisMonth} recargado` : undefined} />
          </>
        )}
      </div>

      {/* Visitas por día — last 14 days */}
      <div className="card-surface mb-4">
        <p className="text-xs text-coffee-medium uppercase tracking-wide font-semibold mb-4">
          Visitas — últimos 14 días
        </p>
        {loading ? <SkeletonBlock /> : <VisitChart data={recentVisits} color={brandColor} />}
      </div>

      {/* Nuevos clientes por semana — horizontal bars */}
      <div className="card-surface mb-4">
        <p className="text-xs text-coffee-medium uppercase tracking-wide font-semibold mb-4">
          Nuevos clientes por semana
        </p>
        {loading ? <SkeletonBlock /> : weeksData.length === 0 ? (
          <p className="text-sm text-coffee-medium text-center py-4">Sin datos aún</p>
        ) : (
          <HorizontalBarChart data={weeksData} color={brandColor} />
        )}
      </div>

      {/* Rentabilidad del programa */}
      <div className="card-surface mb-4">
        <p className="text-xs text-coffee-medium uppercase tracking-wide font-semibold mb-3">
          Rentabilidad del programa
        </p>
        {loading ? (
          <SkeletonBlock />
        ) : !data?.profitability.rewardCostConfigured ? (
          <div className="text-center py-3">
            <p className="text-sm text-coffee-medium">Configura el costo del regalo en</p>
            <a href={`/${slug}/admin/rewards`} className="text-sm font-medium text-coffee-brand underline">Recompensas</a>
            <p className="text-sm text-coffee-medium mt-1">para ver la rentabilidad.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-coffee-medium">Ticket promedio</span>
              <span className="font-semibold text-coffee-dark">{data.profitability.avgTicketMXN}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-coffee-medium">Ingresos/ciclo ({data.profitability.visitsRequired} vis.)</span>
              <span className="font-semibold text-coffee-dark">{data.profitability.revenuePerCycleMXN}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-coffee-medium">Costo del regalo</span>
              <span className="font-semibold text-red-600">-{data.profitability.rewardCostMXN}</span>
            </div>
            <div className="h-px bg-coffee-pale" />
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-coffee-dark">Margen por ciclo</span>
              <div className="text-right">
                <span className={`font-bold text-lg ${(data.profitability.marginPercent ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.profitability.marginPerCycleMXN}
                </span>
                {data.profitability.marginPercent !== null && (
                  <p className="text-xs text-coffee-medium">{data.profitability.marginPercent}%</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top 10 clientes */}
      <div className="card-surface">
        <p className="text-xs text-coffee-medium uppercase tracking-wide font-semibold mb-3">
          Top 10 clientes
        </p>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-coffee-pale rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (data?.topCustomers ?? []).length === 0 ? (
          <p className="text-sm text-coffee-medium text-center py-4">Sin datos aún</p>
        ) : (
          <div className="space-y-1">
            {(data?.topCustomers ?? []).map((c, i) => (
              <Link
                key={c.id}
                href={`/${slug}/admin/customers/${c.id}`}
                className="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-coffee-pale transition-colors"
              >
                <span
                  className="flex items-center justify-center text-xs font-bold flex-shrink-0 rounded-full"
                  style={{
                    width: '26px',
                    height: '26px',
                    backgroundColor: i === 0 ? '#C9993B' : i === 1 ? '#9E9E9E' : i === 2 ? '#A0673A' : '#EAE0D3',
                    color: i < 3 ? 'white' : '#6B5C52',
                  }}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-coffee-dark truncate">{c.name || 'Sin nombre'}</p>
                  <p className="text-xs text-coffee-medium">{c.cardNumber}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-coffee-dark">{c.totalVisits} vis.</p>
                  <p className="text-xs text-coffee-medium">{c.balanceMXN}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
