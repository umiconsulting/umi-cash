'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface TenantSettings {
  name: string;
  city: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  logoUrl: string | null;
  stripImageUrl: string | null;
  promoMessage: string | null;
  selfRegistration: boolean;
  cardPrefix: string;
  slug: string;
}

export default function SettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [form, setForm] = useState({
    name: '',
    city: '',
    primaryColor: '#B5605A',
    secondaryColor: '',
    logoUrl: '',
    stripImageUrl: '',
    promoMessage: '',
    selfRegistration: true,
  });

  useEffect(() => { loadSettings(); }, [slug]);

  async function loadSettings() {
    const token = localStorage.getItem('accessToken');
    if (!token) { setLoading(false); return; }
    const res = await fetch(`/api/${slug}/admin/settings`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setLoading(false); return; }
    const data: TenantSettings = await res.json();
    setSettings(data);
    setForm({
      name: data.name,
      city: data.city ?? '',
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor ?? '',
      logoUrl: data.logoUrl ?? '',
      stripImageUrl: data.stripImageUrl ?? '',
      promoMessage: data.promoMessage ?? '',
      selfRegistration: data.selfRegistration,
    });
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/${slug}/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage('Configuración guardada');
      setIsSuccess(true);
      await loadSettings();
    } else {
      setMessage(data.error || 'Error al guardar');
      setIsSuccess(false);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <div className="animate-pulse space-y-4 mt-8">
          <div className="h-8 bg-coffee-pale rounded-xl w-1/2" />
          <div className="h-40 bg-coffee-pale rounded-2xl" />
          <div className="h-40 bg-coffee-pale rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-bold text-coffee-dark mt-4 mb-2">Configuración</h1>
      <p className="text-coffee-medium text-sm mb-6">Información y apariencia de tu negocio</p>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Business info */}
        <div className="card-surface space-y-4">
          <h2 className="font-semibold text-coffee-dark text-sm">Información del negocio</h2>

          <div>
            <label className="block text-sm font-medium text-coffee-dark mb-1.5">Nombre</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              maxLength={100}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-dark mb-1.5">Ciudad</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="input-field"
              placeholder="Culiacán, Sinaloa"
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-dark mb-1.5">URL del logo (opcional)</label>
            <input
              type="text"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              className="input-field"
              placeholder="/logos/mi-logo.png o https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-dark mb-1.5">Imagen decorativa para tarjeta (opcional)</label>
            <p className="text-xs text-coffee-medium mb-1.5">Banner que aparece en la tarjeta de wallet. Tamaño recomendado: 1125×369px</p>
            <input
              type="text"
              value={form.stripImageUrl}
              onChange={(e) => setForm({ ...form, stripImageUrl: e.target.value })}
              className="input-field"
              placeholder="/logos/mi-strip.png o https://..."
            />
          </div>
        </div>

        {/* Promotions */}
        <div className="card-surface space-y-4">
          <h2 className="font-semibold text-coffee-dark text-sm">Promoción en Wallet</h2>
          <p className="text-xs text-coffee-medium -mt-2">Los usuarios recibirán una notificación en su celular cuando cambies este mensaje.</p>

          <div>
            <label className="block text-sm font-medium text-coffee-dark mb-1.5">Mensaje de promoción</label>
            <input
              type="text"
              value={form.promoMessage}
              onChange={(e) => setForm({ ...form, promoMessage: e.target.value })}
              className="input-field"
              placeholder="Ej: 2x1 en bebidas este viernes"
              maxLength={200}
            />
            <p className="text-xs text-coffee-light mt-1">Déjalo vacío para quitar la promoción</p>
          </div>
        </div>

        {/* Branding */}
        <div className="card-surface space-y-4">
          <h2 className="font-semibold text-coffee-dark text-sm">Apariencia</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-coffee-dark mb-1.5">Color principal</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-coffee-pale cursor-pointer flex-shrink-0"
                />
                <input
                  type="text"
                  value={form.primaryColor}
                  onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setForm({ ...form, primaryColor: e.target.value }); }}
                  className="input-field font-mono"
                  placeholder="#B5605A"
                  maxLength={7}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-coffee-dark mb-1.5">
                Color secundario <span className="font-normal text-coffee-light">(opcional)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.secondaryColor || form.primaryColor}
                  onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-coffee-pale cursor-pointer flex-shrink-0"
                />
                <input
                  type="text"
                  value={form.secondaryColor}
                  onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setForm({ ...form, secondaryColor: e.target.value }); }}
                  className="input-field font-mono"
                  placeholder="Sin color"
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          {/* Live card preview */}
          <div>
            <p className="text-xs text-coffee-medium mb-2">Vista previa de la tarjeta</p>
            <div className="rounded-2xl p-4 text-white overflow-hidden" style={{ background: form.primaryColor }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-white/50 text-[9px] uppercase tracking-widest">Miembro</p>
                  <p className="text-white font-semibold text-sm mt-0.5">{form.name || settings?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/50 text-[9px] uppercase tracking-widest">Saldo</p>
                  <p className="text-white font-bold text-sm mt-0.5">$150.00</p>
                </div>
              </div>
              <div className="flex gap-1 mt-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-2 flex-1 rounded-full transition-colors"
                    style={{ background: i < 4 ? (form.secondaryColor || 'rgba(255,255,255,0.9)') : 'rgba(255,255,255,0.2)' }}
                  />
                ))}
              </div>
              {form.secondaryColor && (
                <p className="text-white/40 text-[9px] mt-2 text-right">Acentos en color secundario</p>
              )}
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="card-surface space-y-4">
          <h2 className="font-semibold text-coffee-dark text-sm">Opciones</h2>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-coffee-dark">Registro abierto</p>
              <p className="text-xs text-coffee-medium mt-0.5">Los clientes pueden registrarse solos en /{settings?.slug}/register</p>
            </div>
            <div
              onClick={() => setForm({ ...form, selfRegistration: !form.selfRegistration })}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.selfRegistration ? 'bg-coffee-brand' : 'bg-coffee-pale'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.selfRegistration ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
          </label>

          <div>
            <label className="block text-sm font-medium text-coffee-dark mb-1">Prefijo de tarjeta</label>
            <p className="text-xs text-coffee-medium mb-1.5">Se asigna al crear la cuenta — no se puede cambiar después</p>
            <input type="text" value={settings?.cardPrefix ?? ''} className="input-field font-mono bg-coffee-pale/50" readOnly />
          </div>
        </div>

        {message && (
          <p className={`text-center text-sm font-medium ${isSuccess ? 'text-green-700' : 'text-red-700'}`}>{message}</p>
        )}

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}
