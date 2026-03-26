'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { COMMON_TOPUP_AMOUNTS, centavosFromPesos, formatMXN } from '@/lib/currency';

interface GiftCardItem {
  id: string;
  code: string;
  amountMXN: string;
  amountCentavos: number;
  senderName: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  message: string | null;
  isRedeemed: boolean;
  redeemedAt: string | null;
  createdAt: string;
}

export default function GiftCardsPage() {
  const { slug } = useParams<{ slug: string }>();

  // List state
  const [cards, setCards] = useState<GiftCardItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [senderName, setSenderName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{
    success: boolean; message: string; code?: string; amountMXN?: string;
  } | null>(null);

  const fetchCards = useCallback(async (p = 1) => {
    setListLoading(true);
    const token = localStorage.getItem('accessToken');
    if (!token) { setListLoading(false); return; }
    try {
      const res = await fetch(`/api/${slug}/admin/gift-cards?page=${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCards(data.giftCards);
        setTotalPages(data.pages);
        setPage(p);
      }
    } catch {}
    finally { setListLoading(false); }
  }, [slug]);

  useEffect(() => { fetchCards(1); }, [fetchCards]);

  function selectAmount(centavos: number) { setAmount(String(centavos / 100)); }

  function resetForm() {
    setAmount(''); setSenderName(''); setRecipientName('');
    setRecipientEmail(''); setRecipientPhone(''); setMessage('');
    setCreateResult(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateResult(null);
    const token = localStorage.getItem('accessToken');
    if (!token) { setCreating(false); return; }

    let amountCentavos: number;
    try { amountCentavos = centavosFromPesos(amount); } catch {
      setCreateResult({ success: false, message: 'Monto inválido' });
      setCreating(false); return;
    }
    if (amountCentavos < 100) {
      setCreateResult({ success: false, message: 'El monto mínimo es $1.00 MXN' });
      setCreating(false); return;
    }
    if (!recipientEmail.trim() && !recipientPhone.trim()) {
      setCreateResult({ success: false, message: 'Ingresa email o teléfono del destinatario' });
      setCreating(false); return;
    }

    try {
      const res = await fetch(`/api/${slug}/admin/gift-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amountCentavos,
          senderName: senderName.trim() || undefined,
          message: message.trim() || undefined,
          recipientEmail: recipientEmail.trim() || undefined,
          recipientPhone: recipientPhone.trim() || undefined,
          recipientName: recipientName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreateResult({
          success: true,
          message: `Tarjeta creada exitosamente`,
          code: data.giftCard.code,
          amountMXN: data.giftCard.amountMXN,
        });
        resetForm();
        fetchCards(1);
      } else {
        setCreateResult({ success: false, message: data.error || 'Error al crear' });
      }
    } catch {
      setCreateResult({ success: false, message: 'Error de conexión' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mt-4 mb-6">
        <h1 className="font-display text-2xl font-bold text-coffee-dark">Tarjetas de Regalo</h1>
        <button
          onClick={() => { setShowForm((v) => !v); setCreateResult(null); }}
          className="btn-primary text-sm px-4 py-2"
        >
          {showForm ? 'Cancelar' : '+ Nueva'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 mb-6">
          <div className="card-surface">
            <p className="text-sm font-semibold text-coffee-dark mb-3">Monto del regalo (MXN)</p>
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
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Otro monto, ej: 350" className="input-field"
              min="1" max="10000" step="0.01" required
            />
            {amount && !isNaN(parseFloat(amount)) && (
              <p className="text-sm text-coffee-medium mt-2">= {formatMXN(Math.round(parseFloat(amount) * 100))}</p>
            )}
          </div>

          <div className="card-surface space-y-3">
            <p className="text-sm font-semibold text-coffee-dark">Destinatario</p>
            <input
              type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Nombre del destinatario (opcional)" className="input-field"
              maxLength={100}
            />
            <input
              type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Email del destinatario" className="input-field"
              maxLength={200}
            />
            <input
              type="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="Teléfono del destinatario (ej: +52 55 1234 5678)" className="input-field"
              maxLength={20}
            />
            <p className="text-xs text-coffee-light">Se requiere al menos email o teléfono.</p>
          </div>

          <div className="card-surface space-y-3">
            <p className="text-sm font-semibold text-coffee-dark">Personalización (opcional)</p>
            <input
              type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)}
              placeholder="De parte de (ej: Mamá, Juan García)" className="input-field"
              maxLength={100}
            />
            <textarea
              value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensaje personal..." className="input-field resize-none h-20"
              maxLength={300}
            />
          </div>

          {createResult && (
            <div className={`card-surface border-2 ${createResult.success ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
              <p className={`font-semibold text-center ${createResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {createResult.message}
              </p>
              {createResult.code && (
                <div className="mt-3 text-center">
                  <p className="text-sm text-coffee-medium mb-1">Código de canje:</p>
                  <p className="font-mono text-2xl font-bold tracking-widest text-coffee-dark bg-coffee-pale rounded-xl px-4 py-2 inline-block">
                    {createResult.code}
                  </p>
                  <p className="text-sm text-coffee-medium mt-1">{createResult.amountMXN}</p>
                </div>
              )}
            </div>
          )}

          <button type="submit" disabled={creating || !amount} className="btn-primary w-full">
            {creating ? 'Creando...' : 'Crear tarjeta de regalo'}
          </button>
        </form>
      )}

      {/* Gift cards list */}
      {listLoading ? (
        <div className="text-center py-8 text-coffee-medium">Cargando...</div>
      ) : cards.length === 0 ? (
        <div className="card-surface text-center text-coffee-medium py-8">
          <p className="text-4xl mb-3">🎁</p>
          <p className="font-medium">Aún no hay tarjetas de regalo</p>
          <p className="text-sm mt-1">Crea una para que un cliente pueda regalarle saldo a alguien.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <div key={card.id} className={`card-surface ${card.isRedeemed ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-coffee-dark tracking-wider">{card.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      card.isRedeemed ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
                    }`}>
                      {card.isRedeemed ? 'Canjeada' : 'Disponible'}
                    </span>
                  </div>
                  <p className="font-bold text-lg text-coffee-dark mt-0.5">{card.amountMXN}</p>
                  {card.recipientName && (
                    <p className="text-sm text-coffee-medium">Para: {card.recipientName}</p>
                  )}
                  {(card.recipientEmail || card.recipientPhone) && (
                    <p className="text-xs text-coffee-light truncate">
                      {card.recipientEmail || card.recipientPhone}
                    </p>
                  )}
                  {card.senderName && (
                    <p className="text-xs text-coffee-light">De: {card.senderName}</p>
                  )}
                  {card.message && (
                    <p className="text-xs text-coffee-medium italic mt-1 line-clamp-2">"{card.message}"</p>
                  )}
                  {card.redeemedAt && (
                    <p className="text-xs text-coffee-light mt-1">
                      Canjeada: {new Date(card.redeemedAt).toLocaleDateString('es-MX')}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-coffee-light flex-shrink-0">
                  {new Date(card.createdAt).toLocaleDateString('es-MX')}
                </div>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => fetchCards(page - 1)}
                disabled={page <= 1}
                className="btn-secondary text-sm px-4 py-1.5 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-coffee-medium text-sm self-center">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => fetchCards(page + 1)}
                disabled={page >= totalPages}
                className="btn-secondary text-sm px-4 py-1.5 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
