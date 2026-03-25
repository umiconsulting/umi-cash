'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { COMMON_TOPUP_AMOUNTS, centavosFromPesos, formatMXN } from '@/lib/currency';

export default function TopUpPage() {
  const { slug } = useParams<{ slug: string }>();
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean; message: string; newBalanceMXN?: string; customer?: string;
  } | null>(null);

  function selectAmount(centavos: number) { setAmount(String(centavos / 100)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const token = localStorage.getItem('accessToken');
    if (!token) { setLoading(false); return; }

    try {
      let amountCentavos: number;
      try { amountCentavos = centavosFromPesos(amount); } catch {
        setResult({ success: false, message: 'Monto inválido' }); return;
      }

      if (amountCentavos < 100) { setResult({ success: false, message: 'El monto mínimo es $1.00 MXN' }); return; }

      const res = await fetch(`/api/${slug}/admin/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cardId: cardId.trim(), amountCentavos, note }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, message: `Recarga exitosa: ${data.amountMXN}`, newBalanceMXN: data.newBalanceMXN, customer: data.customer });
        setCardId(''); setAmount(''); setNote('');
      } else {
        setResult({ success: false, message: data.error || 'Error al recargar' });
      }
    } catch {
      setResult({ success: false, message: 'Error de conexión' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-bold text-coffee-dark mt-4 mb-6">Recargar Saldo</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card-surface">
          <label className="block text-sm font-semibold text-coffee-dark mb-2">Número de tarjeta o ID</label>
          <input type="text" value={cardId} onChange={(e) => setCardId(e.target.value)} placeholder="EGR-1234567890" className="input-field" required />
          <p className="text-xs text-coffee-light mt-1">Busca el número en la tarjeta digital del cliente</p>
        </div>

        <div className="card-surface">
          <label className="block text-sm font-semibold text-coffee-dark mb-3">Monto (MXN)</label>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {COMMON_TOPUP_AMOUNTS.map(({ label, centavos }) => (
              <button key={centavos} type="button" onClick={() => selectAmount(centavos)}
                className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                  amount === String(centavos / 100) ? 'bg-coffee-dark text-white' : 'bg-coffee-pale text-coffee-medium hover:bg-coffee-light/30'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Otro monto, ej: 350" className="input-field" min="1" max="10000" step="0.50" required />
          {amount && !isNaN(parseFloat(amount)) && (
            <p className="text-sm text-coffee-medium mt-2">= {formatMXN(Math.round(parseFloat(amount) * 100))}</p>
          )}
        </div>

        <div className="card-surface">
          <label className="block text-sm font-semibold text-coffee-dark mb-2">Nota (opcional)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recarga en tienda" className="input-field" maxLength={200} />
        </div>

        {result && (
          <div className={`card-surface border-2 text-center ${result.success ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
            <p className={`font-semibold ${result.success ? 'text-green-800' : 'text-red-800'}`}>{result.message}</p>
            {result.success && result.newBalanceMXN && (
              <p className="text-coffee-dark mt-2">Nuevo saldo: <span className="font-bold text-lg">{result.newBalanceMXN}</span></p>
            )}
            {result.customer && <p className="text-sm text-gray-600 mt-1">Cliente: {result.customer}</p>}
          </div>
        )}

        <button type="submit" disabled={loading || !cardId || !amount} className="btn-primary w-full">
          {loading ? 'Procesando...' : 'Recargar saldo'}
        </button>
      </form>
    </div>
  );
}
