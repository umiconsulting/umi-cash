'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { RewardConfig } from '@/types/api';
import { formatFullDateMX } from '@/lib/intl';

export default function RewardsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [active, setActive] = useState<RewardConfig | null>(null);
  const [history, setHistory] = useState<RewardConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ visitsRequired: 10, rewardName: '', rewardDescription: '' });
  const [message, setMessage] = useState('');
  const [messageIsSuccess, setMessageIsSuccess] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => { setRole(localStorage.getItem('userRole')); loadConfig(); }, [slug]);

  async function loadConfig() {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    const res = await fetch(`/api/${slug}/admin/reward-config`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setActive(data.active);
    setHistory(data.history || []);
    if (data.active) setForm({ visitsRequired: data.active.visitsRequired, rewardName: data.active.rewardName, rewardDescription: data.active.rewardDescription || '' });
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (role !== 'ADMIN') { setMessage('Solo los administradores pueden cambiar las recompensas.'); return; }
    if (!confirm(`¿Cambiar la recompensa a "${form.rewardName}"?\n\nEl progreso de los clientes se conserva.`)) return;
    setSaving(true);
    setMessage('');

    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/${slug}/admin/reward-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) { setMessage('Recompensa actualizada'); setMessageIsSuccess(true); await loadConfig(); }
    else { setMessage(data.error); setMessageIsSuccess(false); }
    setSaving(false);
  }

  const PRESETS = ['Cookie de temporada', 'Americano helado', 'Latte helado', 'Café de la casa', 'Croissant', 'Pan de temporada'];

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <div className="animate-pulse space-y-4 mt-8">
          <div className="h-8 bg-coffee-pale rounded-xl w-1/2" />
          <div className="h-40 bg-coffee-pale rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-bold text-coffee-dark mt-4 mb-2">Recompensas</h1>
      <p className="text-coffee-medium text-sm mb-6">Configura qué reciben los clientes al completar su ciclo de visitas</p>

      {active && (
        <div className="loyalty-card rounded-2xl p-5 text-white mb-6 relative z-10">
          <p className="text-coffee-light text-xs uppercase tracking-widest">Recompensa activa</p>
          <h2 className="font-display text-xl font-bold mt-1">{active.rewardName}</h2>
          <p className="text-coffee-light mt-1 text-sm">Cada {active.visitsRequired} visitas</p>
          {active.rewardDescription && <p className="text-coffee-pale/70 text-xs mt-2">{active.rewardDescription}</p>}
        </div>
      )}

      {role === 'ADMIN' ? (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="card-surface">
            <label className="block text-sm font-semibold text-coffee-dark mb-2">Visitas para ganar recompensa</label>
            <input type="number" value={form.visitsRequired} onChange={(e) => setForm({ ...form, visitsRequired: parseInt(e.target.value) })} className="input-field" min={1} max={100} required />
          </div>

          <div className="card-surface">
            <label className="block text-sm font-semibold text-coffee-dark mb-2">Nombre de la recompensa</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setForm({ ...form, rewardName: p })}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${form.rewardName === p ? 'bg-coffee-dark text-white' : 'bg-coffee-pale text-coffee-medium hover:bg-coffee-light/30'}`}>
                  {p}
                </button>
              ))}
            </div>
            <input type="text" value={form.rewardName} onChange={(e) => setForm({ ...form, rewardName: e.target.value })} placeholder="Cookie de temporada" className="input-field" required maxLength={100} />
          </div>

          <div className="card-surface">
            <label className="block text-sm font-semibold text-coffee-dark mb-2">Descripción (opcional)</label>
            <textarea value={form.rewardDescription} onChange={(e) => setForm({ ...form, rewardDescription: e.target.value })} placeholder="Descripción para los clientes..." className="input-field" rows={3} maxLength={300} />
          </div>

          {message && <div className={`text-center text-sm font-medium ${messageIsSuccess ? 'text-green-700' : 'text-red-700'}`}>{message}</div>}

          <button type="submit" disabled={saving || !form.rewardName} className="btn-primary w-full">
            {saving ? 'Guardando...' : 'Guardar recompensa'}
          </button>
        </form>
      ) : (
        <div className="card-surface">
          <p className="text-coffee-medium text-sm">Solo los administradores pueden cambiar la configuración de recompensas.</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="font-semibold text-coffee-dark mb-3">Recompensas anteriores</h3>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="card-surface flex justify-between items-center text-sm">
                <div><p className="font-medium text-coffee-dark">{h.rewardName}</p><p className="text-coffee-light">Cada {h.visitsRequired} visitas</p></div>
                <div className="text-right text-coffee-light text-xs">{formatFullDateMX(new Date(h.activatedAt))}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
