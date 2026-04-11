'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTenant } from '@/context/TenantContext';

function WalletAddButtons({ token, slug }: { token: string; slug: string }) {
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isApple, setIsApple] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [appleAdded, setAppleAdded] = useState(false);
  const [googleAdded, setGoogleAdded] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsApple(/iPhone|iPad|iPod/.test(ua));
    setIsAndroid(/Android/.test(ua));
  }, []);

  async function handleApple() {
    setAppleLoading(true);
    try {
      // Open directly so iOS Safari handles the .pkpass natively
      window.location.href = `/api/${slug}/passes/apple?token=${encodeURIComponent(token)}`;
      setAppleAdded(true);
    } finally {
      setTimeout(() => setAppleLoading(false), 2000);
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
        alert(err.error || 'Error al guardar en Google Wallet.');
        return;
      }
      const { saveUrl } = await res.json();
      // Navigate directly — window.open gets blocked by popup blockers on Android
      window.location.href = saveUrl;
      setGoogleAdded(true);
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {(isApple || (!isApple && !isAndroid)) && (
        <button
          onClick={handleApple}
          disabled={appleLoading}
          className={`apple-wallet-btn w-full justify-center ${appleAdded ? 'opacity-70' : ''}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          {appleLoading ? 'Guardando...' : appleAdded ? '✓ Guardado en Apple Wallet' : 'Guardar en Apple Wallet'}
        </button>
      )}
      {(isAndroid || (!isApple && !isAndroid)) && (
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className={`google-wallet-btn w-full justify-center ${googleAdded ? 'opacity-70' : ''}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {googleLoading ? 'Guardando...' : googleAdded ? '✓ Guardado en Google Wallet' : 'Guardar en Google Wallet'}
        </button>
      )}
    </div>
  );
}

interface SuccessState {
  name: string;
  token: string;
}

const COUNTRY_CODES = [
  { dial: '52',  flag: '🇲🇽', name: 'México' },
  { dial: '1',   flag: '🇺🇸', name: 'EE. UU. / Canadá' },
  { dial: '34',  flag: '🇪🇸', name: 'España' },
  { dial: '54',  flag: '🇦🇷', name: 'Argentina' },
  { dial: '57',  flag: '🇨🇴', name: 'Colombia' },
  { dial: '56',  flag: '🇨🇱', name: 'Chile' },
  { dial: '51',  flag: '🇵🇪', name: 'Perú' },
  { dial: '58',  flag: '🇻🇪', name: 'Venezuela' },
  { dial: '593', flag: '🇪🇨', name: 'Ecuador' },
  { dial: '502', flag: '🇬🇹', name: 'Guatemala' },
  { dial: '503', flag: '🇸🇻', name: 'El Salvador' },
  { dial: '504', flag: '🇭🇳', name: 'Honduras' },
  { dial: '505', flag: '🇳🇮', name: 'Nicaragua' },
  { dial: '506', flag: '🇨🇷', name: 'Costa Rica' },
  { dial: '507', flag: '🇵🇦', name: 'Panamá' },
  { dial: '591', flag: '🇧🇴', name: 'Bolivia' },
  { dial: '595', flag: '🇵🇾', name: 'Paraguay' },
  { dial: '598', flag: '🇺🇾', name: 'Uruguay' },
  { dial: '1',   flag: '🇩🇴', name: 'Rep. Dominicana' },
];

export default function RegisterPage() {
  const { slug } = useParams<{ slug: string }>();
  const tenant = useTenant();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [dialCode, setDialCode] = useState('52');
  const [localPhone, setLocalPhone] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<SuccessState | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const digits = localPhone.replace(/\D/g, '');
    if (digits.length < 6) {
      setError('Ingresa un número de teléfono válido');
      setLoading(false);
      return;
    }

    const fullPhone = `+${dialCode}${digits}`;

    try {
      const res = await fetch(`/api/${slug}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone: fullPhone, birthDate }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.accessToken) {
          // Phone already registered — server returns token directly
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('userRole', data.user.role);
          setSuccess({ name: data.user.name?.split(' ')[0] || 'tú', token: data.accessToken });
        } else {
          setError(data.error || 'Error al registrarse');
        }
        return;
      }

      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('userRole', data.user.role);
        setSuccess({ name: name.split(' ')[0], token: data.accessToken });
      } else {
        setError('Cuenta creada. Escanea tu QR en tienda o contacta al personal.');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen bg-coffee-cream flex flex-col">
        <div className="loyalty-card text-white px-6 py-10 text-center">
          <div className="max-w-sm mx-auto relative z-10">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-bold">¡Listo, {success.name}!</h1>
            <p className="text-coffee-light text-sm mt-2">Tu tarjeta está activa. Agrégala a tu teléfono para tenerla siempre a la mano.</p>
          </div>
        </div>

        <div className="flex-1 px-6 py-8 max-w-sm mx-auto w-full space-y-4">
          <div className="card-surface">
            <p className="text-xs text-coffee-medium text-center mb-5 font-medium uppercase tracking-wide">Guarda tu tarjeta — un toque, listo</p>
            <WalletAddButtons token={success.token} slug={slug} />
          </div>

          <div className="card-surface space-y-3">
            <div className="space-y-2 text-sm text-coffee-medium">
              <div className="flex gap-3 items-start">
                <span className="text-coffee-brand font-bold flex-shrink-0">✓</span>
                <p>Tu tarjeta ya está activa. Muéstrasela al barista en tu próxima visita.</p>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-coffee-brand font-bold flex-shrink-0">✓</span>
                <p>Después de cada escaneo, la tarjeta se actualiza sola.</p>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-coffee-brand font-bold flex-shrink-0">✓</span>
                <p>Al completar tus visitas, ganas la recompensa del mes.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-coffee-cream flex flex-col">
      <div className="loyalty-card text-white px-6 py-12 text-center">
        <div className="max-w-sm mx-auto relative z-10">
          <p className="text-coffee-pale/50 text-xs tracking-[0.2em] uppercase mb-3">{tenant.name}</p>
          <h1 className="font-display text-2xl font-bold">Crea tu tarjeta</h1>
          <p className="text-coffee-light text-sm mt-1">Gratis, en menos de un minuto.</p>
        </div>
      </div>

      <div className="flex-1 px-6 py-8 max-w-sm mx-auto w-full">
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-coffee-dark mb-1.5">Nombre completo</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="María García" className="input-field" required autoComplete="name" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-coffee-dark mb-1.5">Fecha de nacimiento</label>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="input-field" max={new Date().toISOString().split('T')[0]} required />
          </div>

          <div>
            <label className="block text-sm font-semibold text-coffee-dark mb-1.5">Teléfono</label>
            <div className="flex gap-2">
              <div className="relative flex-shrink-0">
                <select
                  value={dialCode}
                  onChange={(e) => setDialCode(e.target.value)}
                  className="appearance-none h-full pl-3 pr-7 rounded-xl border border-coffee-pale bg-white text-coffee-dark text-sm focus:outline-none focus:ring-1 focus:ring-coffee-medium cursor-pointer"
                  aria-label="Código de país"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={`${c.dial}-${c.name}`} value={c.dial}>
                      {c.flag} +{c.dial}
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-coffee-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <input
                type="tel"
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value)}
                placeholder="55 1234 5678"
                className="input-field flex-1"
                autoComplete="tel-national"
                required
                inputMode="numeric"
              />
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-coffee-light text-coffee-dark focus:ring-coffee-medium flex-shrink-0" required />
            <span className="text-xs text-coffee-medium leading-relaxed">
              He leído y acepto el{' '}
              <Link href={`/${slug}/aviso-privacidad`} className="text-coffee-dark underline font-medium" target="_blank">Aviso de Privacidad</Link>{' '}y los{' '}
              <Link href={`/${slug}/terminos`} className="text-coffee-dark underline font-medium" target="_blank">Términos</Link>.
            </span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading || !name || !birthDate || !localPhone || !privacyAccepted} className="btn-primary w-full">
            {loading ? 'Creando tu tarjeta...' : 'Crear mi tarjeta gratis'}
          </button>
        </form>

        <p className="text-center text-xs text-coffee-light mt-6">
          <Link href={`/${slug}`} className="underline">← Volver</Link>
        </p>
      </div>
    </main>
  );
}
