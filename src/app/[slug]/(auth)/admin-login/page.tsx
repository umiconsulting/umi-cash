'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTenant } from '@/context/TenantContext';

export default function AdminLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const tenant = useTenant();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      for (const role of ['ADMIN', 'STAFF'] as const) {
        const res = await fetch(`/api/${slug}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: email, password, role }),
        });

        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('userRole', data.user.role);
          window.location.href = `/${slug}/admin`;
          return;
        }
      }

      setError('Credenciales inválidas');
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-coffee-cream flex flex-col">
      <div className="loyalty-card text-white px-6 py-12 text-center">
        <h1 className="font-display text-2xl font-bold">{tenant.name}</h1>
        <p className="text-coffee-light mt-1">Acceso empleados</p>
      </div>

      <div className="flex-1 px-6 py-8 max-w-sm mx-auto w-full">
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-coffee-dark mb-2">Correo electrónico</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.mx" className="input-field" required autoComplete="email" />
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-dark mb-2">Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" required autoComplete="current-password" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href={`/${slug}`} className="text-sm text-coffee-medium">← Volver al inicio</Link>
        </div>
      </div>
    </main>
  );
}
