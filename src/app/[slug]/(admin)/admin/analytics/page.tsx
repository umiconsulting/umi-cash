'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

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

function SkeletonBar() {
  return <div className="h-4 bg-coffee-pale rounded animate-pulse" />;
}

interface BarChartItem {
  label: string;
  count: number;
}

function BarChart({
  data,
  color,
  showEvery,
}: {
  data: BarChartItem[];
  color: string;
  showEvery: number;
}) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '80px', width: '100%' }}>
      {data.map((d, i) => {
        const heightPct = (d.count / maxCount) * 100;
        const showLabel = i % showEvery === 0;

        return (
          <div
            key={i}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}
            title={`${d.label}: ${d.count}`}
          >
            <div
              style={{
                width: '100%',
                height: `${heightPct}%`,
                minHeight: d.count > 0 ? '2px' : '0',
                backgroundColor: color,
                borderRadius: '2px 2px 0 0',
                transition: 'height 0.3s',
              }}
            />
            {showLabel && (
              <span
                style={{
                  fontSize: '9px',
                  color: '#9E897A',
                  marginTop: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
              >
                {d.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card-surface text-center">
      <p className="text-xl font-bold text-coffee-dark">{value}</p>
      {sub && <p className="text-xs text-coffee-brand font-medium">{sub}</p>}
      <p className="text-xs text-coffee-medium mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

function LoadingKpi() {
  return (
    <div className="card-surface">
      <div className="h-7 bg-coffee-pale rounded animate-pulse mb-1" />
      <div className="h-3 bg-coffee-pale rounded animate-pulse w-3/4 mx-auto" />
    </div>
  );
}

export default function AnalyticsPage() {
  const { slug } = useParams<{ slug: string }>();
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

  // Format abbreviated dates for x-axis of visitsByDay
  const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const visitDaysWithLabel = (data?.visitsByDay ?? []).map((v) => {
    const d = new Date(v.date + 'T00:00:00');
    return { label: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`, count: v.count };
  });

  const brandColor = '#B5605A';

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-bold text-coffee-dark mt-4 mb-6">Analíticas</h1>

      {error && (
        <div className="bg-red-50 text-red-700 rounded-xl p-3 mb-4 text-sm">{error}</div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {loading ? (
          <>
            <LoadingKpi />
            <LoadingKpi />
            <LoadingKpi />
            <LoadingKpi />
          </>
        ) : (
          <>
            <KpiCard label="Saldo total en circulación" value={data?.totalBalance ?? '$0.00'} />
            <KpiCard label="Recargas este mes" value={data?.topupsThisMonth ?? '$0.00'} />
            <KpiCard label="Recompensas canjeadas (mes)" value={data?.rewardsRedeemedThisMonth ?? 0} />
            <KpiCard
              label="Tasa de retención"
              value={`${data?.retentionRate ?? 0}%`}
              sub={`Prom. ${data?.avgVisitsPerCustomer ?? 0} vis/cliente`}
            />
          </>
        )}
      </div>

      {/* Visitas por día */}
      <div className="card-surface mb-4">
        <p className="text-xs text-coffee-medium uppercase tracking-wide font-semibold mb-3">
          Visitas por día — últimos 30 días
        </p>
        {loading ? (
          <div className="space-y-1">
            <SkeletonBar />
            <SkeletonBar />
            <SkeletonBar />
          </div>
        ) : (
          <BarChart
            data={visitDaysWithLabel}
            color={brandColor}
            showEvery={5}
          />
        )}
      </div>

      {/* Nuevos clientes por semana */}
      <div className="card-surface mb-4">
        <p className="text-xs text-coffee-medium uppercase tracking-wide font-semibold mb-3">
          Nuevos clientes por semana — últimas 8 semanas
        </p>
        {loading ? (
          <div className="space-y-1">
            <SkeletonBar />
            <SkeletonBar />
          </div>
        ) : (
          <BarChart
            data={(data?.newCustomersByWeek ?? []).map((w) => ({ label: w.week, count: w.count }))}
            color={brandColor}
            showEvery={1}
          />
        )}
      </div>

      {/* Rentabilidad del programa */}
      <div className="card-surface mb-4">
        <p className="text-xs text-coffee-medium uppercase tracking-wide font-semibold mb-3">
          Rentabilidad del programa
        </p>
        {loading ? (
          <div className="space-y-2">
            <SkeletonBar />
            <SkeletonBar />
            <SkeletonBar />
          </div>
        ) : !data?.profitability.rewardCostConfigured ? (
          <div className="text-center py-3">
            <p className="text-sm text-coffee-medium">Configura el costo del regalo en</p>
            <a href={`/${slug}/admin/rewards`} className="text-sm font-medium text-coffee-brand underline">Recompensas → Costo del regalo</a>
            <p className="text-sm text-coffee-medium mt-1">para ver la rentabilidad por ciclo.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-coffee-medium">Ticket promedio</span>
              <span className="font-semibold text-coffee-dark">{data.profitability.avgTicketMXN}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-coffee-medium">Ingresos por ciclo ({data.profitability.visitsRequired} vis.)</span>
              <span className="font-semibold text-coffee-dark">{data.profitability.revenuePerCycleMXN}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-coffee-medium">Costo del regalo</span>
              <span className="font-semibold text-red-600">−{data.profitability.rewardCostMXN}</span>
            </div>
            <div className="h-px bg-coffee-pale my-1" />
            <div className="flex justify-between text-sm items-center">
              <span className="font-semibold text-coffee-dark">Margen por ciclo</span>
              <div className="text-right">
                <span className={`font-bold text-base ${(data.profitability.marginPercent ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.profitability.marginPerCycleMXN}
                </span>
                {data.profitability.marginPercent !== null && (
                  <p className="text-xs text-coffee-medium">{data.profitability.marginPercent}% del ciclo</p>
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
                className="flex items-center gap-3 py-2 px-1 rounded-xl hover:bg-coffee-pale transition-colors"
              >
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: i === 0 ? '#C9993B' : i === 1 ? '#9E9E9E' : i === 2 ? '#A0673A' : '#EAE0D3',
                    color: i < 3 ? 'white' : '#6B5C52',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    flexShrink: 0,
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
                <span className="text-coffee-light ml-1">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
