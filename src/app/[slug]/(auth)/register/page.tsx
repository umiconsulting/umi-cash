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
      const res = await fetch(`/api/${slug}/passes/apple`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Error al guardar en Apple Wallet. Intenta desde tu iPhone.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}.pkpass`;
      a.click();
      URL.revokeObjectURL(url);
      setAppleAdded(true);
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
        alert(err.error || 'Error al guardar en Google Wallet.');
        return;
      }
      const { saveUrl } = await res.json();
      window.open(saveUrl, '_blank');
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

export default function RegisterPage() {
  const { slug } = useParams<{ slug: string }>();
  const tenant = useTenant();
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<SuccessState | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!form.phone && !form.email) {
      setError('Ingresa tu teléfono o correo electrónico');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/${slug}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          ...(form.phone ? { phone: form.phone } : {}),
          ...(form.email ? { email: form.email } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al registrarse');
        return;
      }

      const loginRes = await fetch(`/api/${slug}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: form.phone || form.email, role: 'CUSTOMER' }),
      });

      const loginData = await loginRes.json();
      if (loginRes.ok) {
        localStorage.setItem('accessToken', loginData.accessToken);
        localStorage.setItem('userRole', loginData.user.role);
        setSuccess({ name: form.name.split(' ')[0], token: loginData.accessToken });
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
        <div className="loyalty-card text-white px-6 py-8 text-center">
          <div className="max-w-sm mx-auto relative z-10">
            <h1 className="font-display text-2xl font-bold">¡Bienvenida, {success.name}!</h1>
            <p className="text-coffee-light text-sm mt-1 mb-6">Tu tarjeta está lista.</p>

            {/* Inline card preview */}
            <div className="rounded-2xl overflow-hidden shadow-xl bg-white/10 backdrop-blur-sm border border-white/20 text-left mx-auto max-w-[280px]">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <span className="text-white text-[13px] font-semibold tracking-tight">{tenant.name}</span>
                <div className="text-right">
                  <p className="text-white/40 text-[9px] uppercase tracking-widest">Saldo</p>
                  <p className="text-white text-[14px] font-bold">$0.00</p>
                </div>
              </div>
              <div className="mx-4 h-px bg-white/10" />
              <div className="px-4 pt-2 pb-2">
                <p className="text-white/40 text-[9px] uppercase tracking-widest">Miembro</p>
                <p className="text-white text-[15px] font-semibold mt-0.5">{form.name}</p>
              </div>
              <div className="px-4 pb-3 flex justify-between">
                <div>
                  <p className="text-white/40 text-[9px] uppercase tracking-widest">Visitas</p>
                  <p className="text-white text-[12px] font-semibold mt-0.5">0 / —</p>
                </div>
                <div className="text-right">
                  <p className="text-white/40 text-[9px] uppercase tracking-widest">Estado</p>
                  <p className="text-white text-[12px] font-semibold mt-0.5">Activa ✓</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 px-6 py-8 max-w-sm mx-auto w-full space-y-6">
          <div className="card-surface">
            <h2 className="font-semibold text-coffee-dark text-center mb-1">Guarda tu tarjeta en el teléfono</h2>
            <p className="text-xs text-coffee-medium text-center mb-5">
              Así tendrás tu código siempre a la mano, sin abrir apps.
            </p>
            <WalletAddButtons token={success.token} slug={slug} />
          </div>

          <div className="card-surface space-y-3">
            <h3 className="font-semibold text-coffee-dark text-sm">¿Y ahora qué?</h3>
            <div className="space-y-2 text-sm text-coffee-medium">
              <div className="flex gap-3 items-start">
                <span className="font-bold text-coffee-dark flex-shrink-0">1.</span>
                <p>Tu tarjeta vive en el teléfono. Ábrela, muestra el código al barista.</p>
              </div>
              <div className="flex gap-3 items-start">
                <span className="font-bold text-coffee-dark flex-shrink-0">2.</span>
                <p>Después de cada visita, tu tarjeta se actualiza automáticamente.</p>
              </div>
              <div className="flex gap-3 items-start">
                <span className="font-bold text-coffee-dark flex-shrink-0">3.</span>
                <p>A las 10 visitas, ganas la recompensa del mes.</p>
              </div>
            </div>
          </div>

          <Link href={`/${slug}/card`} className="btn-primary w-full text-center block">
            Ver mi tarjeta →
          </Link>

          <Link href={`/${slug}`} className="text-center text-xs text-coffee-light block">← Volver al inicio</Link>
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
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="María García" className="input-field" required autoComplete="name" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-coffee-dark mb-1.5">Teléfono</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+52 55 1234 5678" className="input-field" autoComplete="tel" />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-coffee-pale" />
            <span className="text-xs text-coffee-light">o usa tu correo</span>
            <div className="flex-1 h-px bg-coffee-pale" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-coffee-dark mb-1.5">Correo electrónico</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" className="input-field" autoComplete="email" />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-coffee-light text-coffee-dark focus:ring-coffee-medium flex-shrink-0" required />
            <span className="text-xs text-coffee-medium leading-relaxed">
              He leído y acepto el{' '}
              <Link href="/aviso-privacidad" className="text-coffee-dark underline font-medium" target="_blank">Aviso de Privacidad</Link>{' '}y los{' '}
              <Link href="/terminos" className="text-coffee-dark underline font-medium" target="_blank">Términos</Link>.
            </span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading || !form.name || !privacyAccepted} className="btn-primary w-full">
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
