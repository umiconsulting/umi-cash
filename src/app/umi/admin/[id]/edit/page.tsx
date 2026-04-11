'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface LocationData {
  id?: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
}

interface TenantEditData {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  cardPrefix: string;
  selfRegistration: boolean;
  topupEnabled: boolean;
  openHour: number | null;
  closeHour: number | null;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  rewardConfig: { visitsRequired: number; rewardName: string } | null;
  locations: LocationData[];
}

export default function EditTenantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<TenantEditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    name: '',
    city: '',
    primaryColor: '#B5605A',
    secondaryColor: '',
    selfRegistration: true,
    topupEnabled: true,
    openHour: '',
    closeHour: '',
    subscriptionStatus: 'ACTIVE',
    rewardName: '',
    visitsRequired: 10,
  });
  const [locations, setLocations] = useState<{ id?: string; name: string; address: string; latitude: string; longitude: string }[]>([]);
  const [geocoding, setGeocoding] = useState<number | null>(null);

  async function geocodeAddress(index: number) {
    const loc = locations[index];
    if (!loc.address || loc.address.length < 3) return;
    setGeocoding(index);
    try {
      const res = await fetch(`/api/umi/geocode?address=${encodeURIComponent(loc.address)}`);
      if (!res.ok) { setError('No se encontró la dirección'); return; }
      const data = await res.json();
      const next = [...locations];
      next[index] = { ...loc, latitude: String(data.latitude), longitude: String(data.longitude), address: data.formattedAddress || loc.address };
      setLocations(next);
    } catch {
      setError('Error al geocodificar');
    } finally {
      setGeocoding(null);
    }
  }

  useEffect(() => {
    fetch(`/api/umi/tenants/${id}`)
      .then((r) => r.json())
      .then((d: TenantEditData) => {
        setData(d);
        setForm({
          name: d.name,
          city: d.city ?? '',
          primaryColor: d.primaryColor,
          secondaryColor: d.secondaryColor ?? '',
          selfRegistration: d.selfRegistration,
          topupEnabled: d.topupEnabled,
          openHour: d.openHour != null ? String(d.openHour) : '',
          closeHour: d.closeHour != null ? String(d.closeHour) : '',
          subscriptionStatus: d.subscriptionStatus,
          rewardName: d.rewardConfig?.rewardName ?? 'Bebida gratis',
          visitsRequired: d.rewardConfig?.visitsRequired ?? 10,
        });
        setLocations(
          d.locations.length > 0
            ? d.locations.map((l) => ({
                id: l.id,
                name: l.name,
                address: l.address ?? '',
                latitude: l.latitude != null ? String(l.latitude) : '',
                longitude: l.longitude != null ? String(l.longitude) : '',
              }))
            : [{ name: '', address: '', latitude: '', longitude: '' }]
        );
        setLoading(false);
      })
      .catch(() => { setError('Error al cargar datos'); setLoading(false); });
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    const validLocations = locations
      .filter((l) => l.name.trim())
      .map((l) => ({
        ...(l.id ? { id: l.id } : {}),
        name: l.name.trim(),
        address: l.address.trim() || null,
        latitude: l.latitude ? parseFloat(l.latitude) : null,
        longitude: l.longitude ? parseFloat(l.longitude) : null,
      }));

    const res = await fetch(`/api/umi/tenants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        city: form.city,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor || null,
        selfRegistration: form.selfRegistration,
        topupEnabled: form.topupEnabled,
        openHour: form.openHour !== '' ? parseInt(form.openHour as string) : null,
        closeHour: form.closeHour !== '' ? parseInt(form.closeHour as string) : null,
        subscriptionStatus: form.subscriptionStatus,
        // Only send reward fields if changed from what was loaded
        ...(data?.rewardConfig && (form.rewardName !== data.rewardConfig.rewardName || form.visitsRequired !== data.rewardConfig.visitsRequired)
          ? { rewardName: form.rewardName, visitsRequired: form.visitsRequired }
          : {}),
        locations: validLocations,
      }),
    });

    const result = await res.json();
    if (res.ok) {
      setSuccess('Guardado correctamente');
      router.refresh();
    } else {
      setError(result.error ?? 'Error al guardar');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-6 py-10 animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded-xl w-1/3" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/umi/admin" className="text-gray-400 hover:text-gray-700 text-sm transition-colors">
            ← Master Admin
          </Link>
          <span className="text-gray-200">/</span>
          <p className="font-semibold text-gray-900">{data?.name}</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <form onSubmit={handleSave} className="space-y-6">

          {/* Business info */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Información del negocio</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" required maxLength={100} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ciudad</label>
                <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" maxLength={100} placeholder="Culiacán, Sinaloa" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Slug</label>
                <input type="text" value={data?.slug ?? ''} readOnly
                  className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm font-mono bg-gray-50 text-gray-400 cursor-not-allowed" />
                <p className="text-xs text-gray-400 mt-1">No se puede cambiar</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Prefijo de tarjeta</label>
                <input type="text" value={data?.cardPrefix ?? ''} readOnly
                  className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm font-mono bg-gray-50 text-gray-400 cursor-not-allowed" />
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Apariencia</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Color principal</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    className="w-10 h-9 rounded-lg border border-gray-200 cursor-pointer" />
                  <input type="text" value={form.primaryColor} onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setForm({ ...form, primaryColor: e.target.value }); }}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" maxLength={7} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Color secundario <span className="text-gray-400 font-normal">(opcional)</span></label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.secondaryColor || form.primaryColor} onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                    className="w-10 h-9 rounded-lg border border-gray-200 cursor-pointer" />
                  <input type="text" value={form.secondaryColor} onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setForm({ ...form, secondaryColor: e.target.value }); }}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Sin degradado" maxLength={7} />
                </div>
              </div>
            </div>

            {/* Live preview */}
            <div className="rounded-xl p-3 flex gap-1" style={{ background: form.primaryColor }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-2 flex-1 rounded-full" style={{ background: i < 4 ? (form.secondaryColor || 'rgba(255,255,255,0.9)') : 'rgba(255,255,255,0.2)' }} />
              ))}
            </div>
          </div>

          {/* Loyalty program */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Programa de lealtad</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Visitas para recompensa</label>
                <input type="number" value={form.visitsRequired} onChange={(e) => setForm({ ...form, visitsRequired: parseInt(e.target.value) || 1 })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" min={1} max={50} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre de la recompensa</label>
                <input type="text" value={form.rewardName} onChange={(e) => setForm({ ...form, rewardName: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" maxLength={100} />
              </div>
            </div>
          </div>

          {/* Locations */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Sucursales</h2>
              <button type="button" onClick={() => setLocations([...locations, { name: '', address: '', latitude: '', longitude: '' }])}
                className="text-xs text-gray-500 hover:text-gray-900 transition-colors">+ Agregar sucursal</button>
            </div>
            {locations.map((loc, i) => (
              <div key={loc.id ?? `new-${i}`} className="space-y-3 p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">Sucursal {i + 1}</p>
                  {locations.length > 1 && (
                    <button type="button" onClick={() => setLocations(locations.filter((_, j) => j !== i))}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors">Eliminar</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                    <input type="text" value={loc.name} onChange={(e) => { const next = [...locations]; next[i] = { ...loc, name: e.target.value }; setLocations(next); }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Sucursal Centro" maxLength={100} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dirección</label>
                    <div className="flex gap-2">
                      <input type="text" value={loc.address} onChange={(e) => { const next = [...locations]; next[i] = { ...loc, address: e.target.value }; setLocations(next); }}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Av. Álvaro Obregón 123" maxLength={200} />
                      <button type="button" onClick={() => geocodeAddress(i)} disabled={geocoding === i || !loc.address}
                        className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                        title="Obtener coordenadas de Google Maps">
                        {geocoding === i ? '...' : 'GPS'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Latitud</label>
                    <input type="text" inputMode="decimal" value={loc.latitude} onChange={(e) => { const next = [...locations]; next[i] = { ...loc, latitude: e.target.value }; setLocations(next); }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="24.8049" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Longitud</label>
                    <input type="text" inputMode="decimal" value={loc.longitude} onChange={(e) => { const next = [...locations]; next[i] = { ...loc, longitude: e.target.value }; setLocations(next); }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="-107.3940" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Subscription & options */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Suscripción y opciones</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Estado de suscripción</label>
              <select value={form.subscriptionStatus} onChange={(e) => setForm({ ...form, subscriptionStatus: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
                <option value="ACTIVE">Activo</option>
                <option value="TRIAL">Prueba</option>
                <option value="SUSPENDED">Suspendido</option>
              </select>
            </div>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-700">Registro abierto</p>
                <p className="text-xs text-gray-400 mt-0.5">Los clientes pueden registrarse en /{data?.slug}/register</p>
              </div>
              <button type="button" onClick={() => setForm({ ...form, selfRegistration: !form.selfRegistration })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${form.selfRegistration ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${form.selfRegistration ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-700">Monedero (saldo)</p>
                <p className="text-xs text-gray-400 mt-0.5">Recargas de saldo, cobros y balance en wallet</p>
              </div>
              <button type="button" onClick={() => setForm({ ...form, topupEnabled: !form.topupEnabled })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${form.topupEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${form.topupEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Horario apertura</label>
                <select value={form.openHour} onChange={(e) => setForm({ ...form, openHour: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
                  <option value="">Sin configurar</option>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Escaneos fuera de horario se marcan como sospechosos</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Horario cierre</label>
                <select value={form.closeHour} onChange={(e) => setForm({ ...form, closeHour: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
                  <option value="">Sin configurar</option>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          {success && <p className="text-sm text-green-600 text-center">{success}</p>}

          <div className="flex gap-3">
            <Link href="/umi/admin" className="flex-1 text-center border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancelar
            </Link>
            <button type="submit" disabled={saving}
              className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
