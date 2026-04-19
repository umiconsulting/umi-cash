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
  promoStartsAt: string | null;
  promoEndsAt: string | null;
  promoDays: string | null;
  selfRegistration: boolean;
  birthdayRewardEnabled: boolean;
  birthdayRewardName: string;
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
    promoStartsAt: '',
    promoEndsAt: '',
    promoDays: '' as string,
    selfRegistration: true,
    birthdayRewardEnabled: false,
    birthdayRewardName: 'Regalo de cumpleaños',
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
      promoStartsAt: data.promoStartsAt ? data.promoStartsAt.slice(0, 16) : '',
      promoEndsAt: data.promoEndsAt ? data.promoEndsAt.slice(0, 16) : '',
      promoDays: data.promoDays ?? '',
      selfRegistration: data.selfRegistration,
      birthdayRewardEnabled: data.birthdayRewardEnabled,
      birthdayRewardName: data.birthdayRewardName,
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
      body: JSON.stringify({
        ...form,
        promoStartsAt: form.promoStartsAt ? new Date(form.promoStartsAt).toISOString() : null,
        promoEndsAt: form.promoEndsAt ? new Date(form.promoEndsAt).toISOString() : null,
        promoDays: form.promoDays || null,
        birthdayRewardName: form.birthdayRewardName || 'Regalo de cumpleaños',
      }),
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
    <div className="px-5 py-6 max-w-lg mx-auto">
      <div className="u-fade-up mb-6">
        <div className="u-eyebrow mb-2">Preferencias</div>
        <h1 className="u-display" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-ink)', margin: 0 }}>
          Configuración
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-ink-light)' }}>Información y apariencia de tu negocio</p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Business info */}
        <div className="u-surface p-5 space-y-4">
          <h2 className="font-semibold text-coffee-dark text-sm">Información del negocio</h2>

          <div>
            <label className="block text-sm font-medium text-coffee-dark mb-1.5">Nombre</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="u-input"
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
              className="u-input"
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
              className="u-input"
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
              className="u-input"
              placeholder="/logos/mi-strip.png o https://..."
            />
          </div>
        </div>

        {/* Special Promotion */}
        <div className="u-surface p-5 space-y-4">
          <h2 className="font-semibold text-coffee-dark text-sm">Promoción especial</h2>
          <p className="text-xs text-coffee-medium -mt-2">Los usuarios recibirán una notificación en su celular cuando actives una promoción.</p>

          <div>
            <label className="block text-sm font-medium text-coffee-dark mb-1.5">Mensaje de la promoción</label>
            <input
              type="text"
              value={form.promoMessage}
              onChange={(e) => setForm({ ...form, promoMessage: e.target.value })}
              className="u-input"
              placeholder="Ej: 2x1 en bebidas frías"
              maxLength={200}
            />
            <p className="text-xs text-coffee-light mt-1">Déjalo vacío para desactivar la promoción</p>
          </div>

          {form.promoMessage && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-coffee-dark mb-1.5">Inicia</label>
                  <input
                    type="datetime-local"
                    value={form.promoStartsAt}
                    onChange={(e) => setForm({ ...form, promoStartsAt: e.target.value })}
                    className="u-input"
                  />
                  <p className="text-xs text-coffee-light mt-1">Vacío = ya activa</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-coffee-dark mb-1.5">Expira</label>
                  <input
                    type="datetime-local"
                    value={form.promoEndsAt}
                    onChange={(e) => setForm({ ...form, promoEndsAt: e.target.value })}
                    className="u-input"
                  />
                  <p className="text-xs text-coffee-light mt-1">Vacío = sin expiración</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-coffee-dark mb-2">Días válidos</label>
                <div className="flex gap-1.5">
                  {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day, i) => {
                    const selected = form.promoDays ? form.promoDays.split(',').includes(String(i)) : false;
                    const allEmpty = !form.promoDays;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const current = form.promoDays ? form.promoDays.split(',').filter(Boolean) : [];
                          const next = selected
                            ? current.filter((d) => d !== String(i))
                            : [...current, String(i)];
                          setForm({ ...form, promoDays: next.join(',') });
                        }}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                          selected ? 'bg-coffee-dark text-white' : allEmpty ? 'bg-coffee-pale/60 text-coffee-medium' : 'bg-coffee-pale/30 text-coffee-light'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-coffee-light mt-1.5">Sin selección = todos los días</p>
              </div>
            </>
          )}
        </div>

        {/* Branding */}
        <div className="u-surface p-5 space-y-4">
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
                  className="u-input font-mono"
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
                  className="u-input font-mono"
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

        {/* Birthday Rewards */}
        <div className="u-surface p-5 space-y-4">
          <h2 className="font-semibold text-coffee-dark text-sm">Recompensas de cumpleaños</h2>
          <p className="text-xs text-coffee-medium -mt-2">El cliente recibe una notificación en su wallet el primer día del mes de su cumpleaños con un regalo canjeable una vez durante este mes.</p>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-coffee-dark">Activar recompensas de cumpleaños</p>
              <p className="text-xs text-coffee-medium mt-0.5">Requiere que los clientes tengan fecha de nacimiento registrada</p>
            </div>
            <div
              onClick={() => setForm({ ...form, birthdayRewardEnabled: !form.birthdayRewardEnabled })}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.birthdayRewardEnabled ? 'bg-coffee-brand' : 'bg-coffee-pale'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.birthdayRewardEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
          </label>

          {form.birthdayRewardEnabled && (
            <div>
              <label className="block text-sm font-medium text-coffee-dark mb-1.5">Nombre del regalo</label>
              <input
                type="text"
                value={form.birthdayRewardName}
                onChange={(e) => setForm({ ...form, birthdayRewardName: e.target.value })}
                className="u-input"
                placeholder="Ej: Café gratis, Postre de cortesía"
                maxLength={100}
              />
              <p className="text-xs text-coffee-light mt-1">Aparece en la tarjeta wallet y en la pantalla de escaneo</p>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="u-surface p-5 space-y-4">
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
            <input type="text" value={settings?.cardPrefix ?? ''} className="u-input font-mono bg-coffee-pale/50" readOnly />
          </div>
        </div>

        {message && (
          <p className={`text-center text-sm font-medium ${isSuccess ? 'text-green-700' : 'text-red-700'}`}>{message}</p>
        )}

        <button type="submit" disabled={saving} className="u-btn u-btn-primary w-full">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}
