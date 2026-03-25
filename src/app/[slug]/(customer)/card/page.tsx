'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { formatMXN } from '@/lib/currency';
import { formatDateTimeMX, formatDateShortMX } from '@/lib/intl';
import type { CardState } from '@/types/api';

function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(localStorage.getItem('accessToken'));
  }, []);
  return token;
}

function LoyaltyProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-5 h-5 rounded-full border-2 transition-all duration-300 ${
            i < current
              ? 'bg-white border-white scale-110'
              : 'border-white/40 bg-transparent'
          }`}
        />
      ))}
    </div>
  );
}

function QRDisplay({ token, slug }: { token: string; slug: string }) {
  const [qrData, setQrData] = useState<{ dataUrl: string; expiresAt: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState(300);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const acquireWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {}
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const loadQR = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/${slug}/card/qr`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setQrData(data);
      setTimeLeft(300);
      acquireWakeLock();
    } finally {
      setLoading(false);
    }
  }, [token, slug, acquireWakeLock]);

  useEffect(() => {
    if (token) loadQR();
    return () => releaseWakeLock();
  }, [token, loadQR, releaseWakeLock]);

  useEffect(() => {
    if (!qrData) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { loadQR(); return 300; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [qrData, loadQR]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const urgency = timeLeft < 60;
  const progress = timeLeft / 300;
  const circumference = 2 * Math.PI * 44;

  return (
    <div className="card-surface text-center">
      <h3 className="font-semibold text-coffee-dark mb-1">Tu código QR</h3>
      <p className="text-sm text-coffee-medium mb-5">
        Muéstraselo al barista para registrar tu visita
      </p>

      <div className="relative inline-block mx-auto">
        <svg width="200" height="200" className="absolute inset-0 -rotate-90" style={{ pointerEvents: 'none' }}>
          <circle cx="100" cy="100" r="44" fill="none" stroke={urgency ? '#fca5a5' : '#EAE0D3'} strokeWidth="3" />
          <circle
            cx="100" cy="100" r="44"
            fill="none"
            stroke={urgency ? '#ef4444' : 'var(--color-ink)'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
          />
        </svg>

        {loading ? (
          <div className="w-48 h-48 mx-auto bg-coffee-pale rounded-2xl animate-pulse" />
        ) : qrData ? (
          <div className="qr-display-wrap mx-auto w-48 h-48 flex items-center justify-center">
            <img src={qrData.dataUrl} alt="Código QR de tu tarjeta" className="w-40 h-40" draggable={false} />
          </div>
        ) : (
          <div className="w-48 h-48 mx-auto bg-coffee-pale rounded-2xl flex items-center justify-center">
            <span className="text-coffee-medium text-sm text-center px-4">Error al cargar el QR</span>
          </div>
        )}
      </div>

      <div className={`mt-3 flex items-center justify-center gap-1.5 text-sm font-medium ${urgency ? 'text-red-500' : 'text-coffee-medium'}`}>
        <span className="nums">Válido por {minutes}:{seconds.toString().padStart(2, '0')}</span>
      </div>

      <button
        onClick={loadQR}
        className="mt-2 text-xs text-coffee-light underline hover:text-coffee-dark transition-colors"
      >
        ↺ Actualizar código
      </button>
    </div>
  );
}

function WalletButtons({ token, slug }: { token: string; slug: string }) {
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isApple, setIsApple] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsApple(/iPhone|iPad|iPod|Mac/.test(ua));
    setIsAndroid(/Android/.test(ua));
  }, []);

  async function handleApple() {
    setAppleLoading(true);
    try {
      const res = await fetch(`/api/${slug}/passes/apple`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Error al guardar en Apple Wallet');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}.pkpass`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const res = await fetch(`/api/${slug}/passes/google`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Error al guardar en Google Wallet');
        return;
      }
      const { saveUrl } = await res.json();
      window.open(saveUrl, '_blank');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {isApple && (
        <button onClick={handleApple} disabled={appleLoading} className="apple-wallet-btn w-full justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          {appleLoading ? 'Guardando...' : 'Guardar en Apple Wallet'}
        </button>
      )}
      {(isAndroid || !isApple) && (
        <button onClick={handleGoogle} disabled={googleLoading} className="google-wallet-btn w-full justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.25 17.292l-4.5-4.364 1.386-1.388 3.116 3.020 6.861-6.836 1.387 1.388-8.25 8.18z" />
          </svg>
          {googleLoading ? 'Guardando...' : 'Guardar en Google Wallet'}
        </button>
      )}
    </div>
  );
}

export default function CardPage() {
  const { slug } = useParams<{ slug: string }>();
  const token = useAuth();
  const [card, setCard] = useState<CardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      if (typeof window !== 'undefined') window.location.href = `/${slug}/login`;
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    fetch(`/api/${slug}/card`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((r) => {
        if (r.status === 401) { window.location.href = `/${slug}/login`; return null; }
        return r.json();
      })
      .then((data) => { if (data) setCard(data); })
      .catch((err) => { if (err.name !== 'AbortError') setError('No pudimos cargar tu tarjeta'); })
      .finally(() => { clearTimeout(timeout); setLoading(false); });

    return () => { clearTimeout(timeout); controller.abort(); };
  }, [token, slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-coffee-cream">
        <div className="loyalty-card h-64 animate-pulse" />
        <div className="max-w-sm mx-auto px-4 mt-4 space-y-4">
          <div className="h-48 bg-coffee-pale rounded-2xl animate-pulse" />
          <div className="h-24 bg-coffee-pale rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-screen bg-coffee-cream flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-coffee-medium">{error || 'No pudimos cargar tu tarjeta'}</p>
          <button onClick={() => window.location.reload()} className="mt-4 btn-primary">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const firstName = card.customerName?.split(' ')[0] ?? 'Hola';
  const remaining = card.visitsRequired - card.visitsThisCycle;

  return (
    <main className="min-h-screen bg-coffee-cream pb-8">
      {/* Card hero */}
      <div className="loyalty-card text-white">
        <div className="max-w-sm mx-auto px-6 pt-10 pb-8 relative z-10">
          <div className="flex justify-between items-start mb-7">
            <div>
              <p className="text-coffee-pale/50 text-[10px] font-medium tracking-[0.22em] uppercase">
                {card.tenantName}
              </p>
              <h1 className="font-display text-[1.6rem] font-bold mt-1 leading-tight">
                ¡Buenas, {firstName}!
              </h1>
            </div>
            <div className="text-right">
              <p className="text-coffee-pale/50 text-[10px] uppercase tracking-widest">Saldo</p>
              <p className="text-2xl font-bold nums">{card.balanceMXN}</p>
            </div>
          </div>

          {card.pendingRewards > 0 && (
            <div className="bg-white/15 border border-white/25 rounded-xl p-3 mb-5">
              <p className="text-white font-semibold text-sm text-center">
                {card.pendingRewards === 1 ? 'Tienes una recompensa lista' : `${card.pendingRewards} recompensas listas`}
              </p>
              <p className="text-white/60 text-xs text-center mt-0.5">
                Pídele al barista: {card.rewardName}
              </p>
            </div>
          )}

          <div className="mb-5">
            <div className="flex justify-between items-center mb-3">
              <span className="text-coffee-pale/60 text-xs">Próxima recompensa</span>
              <span className="text-white text-xs font-bold nums">
                {card.visitsThisCycle}/{card.visitsRequired} visitas
              </span>
            </div>
            <LoyaltyProgressDots current={card.visitsThisCycle} total={card.visitsRequired} />
          </div>

          <p className="text-coffee-pale/50 text-xs text-center">
            {remaining > 0
              ? `${remaining} visita${remaining !== 1 ? 's' : ''} más para: ${card.rewardName}`
              : `¡Listo para canjear: ${card.rewardName}!`}
          </p>

          <p className="card-number text-coffee-pale/20 text-[10px] mt-5">{card.cardNumber}</p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-sm mx-auto px-4 mt-4 space-y-4">
        {token && slug && <QRDisplay token={token} slug={slug} />}

        <div className="grid grid-cols-2 gap-3">
          <div className="card-surface text-center">
            <p className="text-3xl font-bold text-coffee-dark nums animate-count-up">{card.totalVisits}</p>
            <p className="text-xs text-coffee-medium mt-1">Visitas totales</p>
          </div>
          <div className="card-surface text-center">
            <p className="text-3xl font-bold text-coffee-dark nums">{card.pendingRewards}</p>
            <p className="text-xs text-coffee-medium mt-1">
              {card.pendingRewards === 1 ? 'Recompensa' : 'Recompensas'}
            </p>
          </div>
        </div>

        {token && slug && (
          <div className="card-surface">
            <h3 className="font-semibold text-coffee-dark mb-1 text-center">Guarda en tu teléfono</h3>
            <p className="text-xs text-coffee-light text-center mb-4">Siempre a la mano, sin abrir apps</p>
            <WalletButtons token={token} slug={slug} />
          </div>
        )}

        {card.recentVisits.length > 0 && (
          <div className="card-surface">
            <h3 className="font-semibold text-coffee-dark mb-3">Últimas visitas</h3>
            <div className="space-y-2">
              {card.recentVisits.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-coffee-pale flex items-center justify-center text-xs text-coffee-medium">✓</span>
                    <span className="text-coffee-dark">Visita registrada</span>
                  </div>
                  <span className="text-coffee-light text-xs">{formatDateTimeMX(new Date(v.scannedAt))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {card.recentTransactions.length > 0 && (
          <div className="card-surface">
            <h3 className="font-semibold text-coffee-dark mb-3">Movimientos de saldo</h3>
            <div className="space-y-2">
              {card.recentTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-coffee-dark">{t.description || 'Movimiento'}</p>
                    <p className="text-coffee-light text-xs">{formatDateShortMX(new Date(t.createdAt))}</p>
                  </div>
                  <span className={`font-semibold nums ${t.amountCentavos > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {t.amountCentavos > 0 ? '+' : ''}{formatMXN(t.amountCentavos)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {card.recentVisits.length === 0 && (
          <div className="card-surface text-center py-8">
            <p className="font-semibold text-coffee-dark">Tu primera visita está por venir</p>
            <p className="text-sm text-coffee-medium mt-1">Muéstrale tu QR al barista y empieza a acumular.</p>
          </div>
        )}

        <p className="text-center text-xs text-coffee-light pb-2">
          Tu saldo nunca vence ·{' '}
          <a href="/terminos" className="underline">Términos</a>
        </p>
      </div>
    </main>
  );
}
