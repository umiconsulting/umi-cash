'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatMXN, COMMON_TOPUP_AMOUNTS, centavosFromPesos } from '@/lib/currency';
import { useTenant } from '@/context/TenantContext';
import { formatDateShortMX, formatDateTimeMX } from '@/lib/intl';

interface CustomerDetail {
  id: string; name: string | null; phone: string | null; email: string | null; device: string | null; os: string | null; birthDate: string | null;
  cardNumber: string; cardId: string; balanceMXN: string; balanceCentavos: number;
  totalVisits: number; visitsThisCycle: number; visitsRequired: number; pendingRewards: number;
  lastVisit: string | null; createdAt: string;
  ltvCentavos: number; ltvMXN: string;
  totalTopupCentavos: number; totalTopupMXN: string;
  recentVisits: { id: string; scannedAt: string }[];
  recentTransactions: { id: string; type: string; amountCentavos: number; description: string | null; createdAt: string }[];
}

export default function CustomerDetailPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const router = useRouter();
  const tenant = useTenant();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsSuccess, setMessageIsSuccess] = useState(false);
  const [confirmRedeem, setConfirmRedeem] = useState(false);

  async function loadCustomer() {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/${slug}/admin/customers/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setCustomer(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadCustomer(); }, [slug, id]);

  async function handleTopUp(e: React.FormEvent) {
    e.preventDefault();
    if (!customer || !topupAmount) return;
    setTopupLoading(true);
    setMessage('');

    const token = localStorage.getItem('accessToken');
    try {
      const centavos = centavosFromPesos(topupAmount);
      const res = await fetch(`/api/${slug}/admin/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cardId: customer.cardId, amountCentavos: centavos }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Recarga de ${data.amountMXN}. Nuevo saldo: ${data.newBalanceMXN}`);
        setMessageIsSuccess(true);
        setTopupAmount('');
        loadCustomer();
      } else {
        setMessage(data.error); setMessageIsSuccess(false);
      }
    } catch { setMessage('Error de conexión'); setMessageIsSuccess(false); }
    finally { setTopupLoading(false); }
  }

  async function handleRedeem() {
    if (!customer) return;
    setRedeemLoading(true);
    setMessage('');

    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/${slug}/admin/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ qrPayload: customer.cardNumber, action: 'REDEEM' }),
    });
    const data = await res.json();
    if (res.ok) { setMessage(data.message); setMessageIsSuccess(true); loadCustomer(); }
    else { setMessage(data.error || data.message); setMessageIsSuccess(false); }
    setRedeemLoading(false);
  }

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto animate-pulse space-y-4 mt-8">
        <div className="h-8 bg-coffee-pale rounded-xl w-1/2" />
        <div className="h-40 bg-coffee-pale rounded-2xl" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-4 text-center mt-12">
        <p className="text-coffee-medium">Cliente no encontrado</p>
        <button onClick={() => router.back()} className="btn-secondary mt-4">← Volver</button>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto pb-8">
      <button onClick={() => router.back()} className="text-coffee-medium text-sm mt-4 mb-4">← Volver</button>

      <div className="loyalty-card rounded-2xl p-5 text-white mb-4 relative z-10">
        <p className="text-coffee-light text-xs uppercase tracking-widest">Cliente</p>
        <h2 className="font-display text-xl font-bold mt-1">{customer.name || 'Sin nombre'}</h2>
        <p className="text-coffee-light text-sm">{customer.phone || customer.email || '—'}</p>
        {customer.device && <p className="text-coffee-pale/40 text-xs mt-0.5">{customer.device}{customer.os ? ` · ${customer.os}` : ''}</p>}
        {customer.birthDate && <p className="text-coffee-pale/60 text-xs mt-0.5">{new Date(customer.birthDate + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}</p>}
        <p className="text-coffee-pale/60 text-xs mt-1">{customer.cardNumber}</p>
        <div className="flex justify-between mt-4">
          {tenant.topupEnabled && <div><p className="text-coffee-light text-xs">Saldo</p><p className="text-xl font-bold">{customer.balanceMXN}</p></div>}
          <div className={tenant.topupEnabled ? 'text-right' : ''}><p className="text-coffee-light text-xs">Visitas</p><p className="text-xl font-bold">{customer.visitsThisCycle}/{customer.visitsRequired}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {tenant.topupEnabled && (
          <div className="card-surface text-center col-span-2 border-coffee-brand/20" style={{ borderColor: 'color-mix(in srgb, var(--color-accent) 25%, transparent)' }}>
            <p className="text-xs text-coffee-medium mb-0.5 uppercase tracking-wide">Valor de vida (LTV)</p>
            <p className="text-3xl font-bold text-coffee-dark">{customer.ltvMXN}</p>
            <p className="text-xs text-coffee-light mt-1">Total gastado en tienda · Recargado: {customer.totalTopupMXN}</p>
          </div>
        )}
        <div className="card-surface text-center"><p className="text-2xl font-bold text-coffee-dark">{customer.totalVisits}</p><p className="text-xs text-coffee-medium">Total visitas</p></div>
        <div className="card-surface text-center"><p className="text-2xl font-bold text-coffee-dark">{customer.pendingRewards}</p><p className="text-xs text-coffee-medium">Recompensas</p></div>
      </div>

      {message && (
        <div className={`rounded-xl p-3 mb-4 text-sm font-medium text-center ${messageIsSuccess ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message}
        </div>
      )}

      {tenant.topupEnabled && (
        <div className="card-surface mb-4">
          <h3 className="font-semibold text-coffee-dark mb-3">Recargar saldo</h3>
          <form onSubmit={handleTopUp} className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {COMMON_TOPUP_AMOUNTS.map(({ label, centavos }) => (
                <button key={centavos} type="button" onClick={() => setTopupAmount(String(centavos / 100))}
                  className={`py-2 rounded-xl text-sm font-medium transition-colors ${topupAmount === String(centavos / 100) ? 'bg-coffee-dark text-white' : 'bg-coffee-pale text-coffee-medium'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="number" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} placeholder="Otro monto" className="input-field flex-1" min="1" max="10000" />
              <button type="submit" disabled={topupLoading || !topupAmount} className="btn-primary">{topupLoading ? '...' : 'Recargar'}</button>
            </div>
          </form>
        </div>
      )}

      {customer.pendingRewards > 0 && (
        <div className="card-surface border-2 border-coffee-brand/30 mb-4">
          <h3 className="font-semibold text-coffee-brand mb-2">
            {customer.pendingRewards} recompensa{customer.pendingRewards > 1 ? 's' : ''} pendiente{customer.pendingRewards > 1 ? 's' : ''}
          </h3>
          {confirmRedeem ? (
            <div className="space-y-2">
              <p className="text-sm text-coffee-dark text-center">¿Confirmar canjeo para {customer.name}?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmRedeem(false)}
                  className="flex-1 py-2 rounded-xl text-sm font-medium border border-coffee-pale text-coffee-medium hover:bg-coffee-pale transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { setConfirmRedeem(false); handleRedeem(); }}
                  disabled={redeemLoading}
                  className="flex-1 bg-coffee-brand text-white py-2 rounded-xl text-sm font-semibold hover:bg-coffee-brand/90 transition-colors"
                >
                  {redeemLoading ? 'Canjeando...' : 'Sí, canjear'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRedeem(true)}
              disabled={redeemLoading}
              className="bg-coffee-brand text-white px-4 py-2 rounded-xl text-sm font-semibold w-full"
            >
              Canjear recompensa
            </button>
          )}
        </div>
      )}

      {customer.recentVisits?.length > 0 && (
        <div className="card-surface mb-4">
          <h3 className="font-semibold text-coffee-dark mb-3">Últimas visitas</h3>
          <div className="space-y-2">
            {customer.recentVisits.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-xs">✓</span>
                  <span className="text-coffee-dark">Visita registrada</span>
                </div>
                <span className="text-coffee-medium">{formatDateTimeMX(new Date(v.scannedAt))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tenant.topupEnabled && customer.recentTransactions?.length > 0 && (
        <div className="card-surface">
          <h3 className="font-semibold text-coffee-dark mb-3">Movimientos de saldo</h3>
          <div className="space-y-2">
            {customer.recentTransactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-coffee-dark">{t.description || 'Movimiento'}</p>
                  <p className="text-coffee-light text-xs">{formatDateShortMX(new Date(t.createdAt))}</p>
                </div>
                <span className={`font-semibold ${t.amountCentavos > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {t.amountCentavos > 0 ? '+' : ''}{formatMXN(t.amountCentavos)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
