'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { COMMON_TOPUP_AMOUNTS, centavosFromPesos, formatMXN } from '@/lib/currency';

interface CustomerSearchResult {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  cardId: string;
  cardNumber: string;
  balanceMXN: string;
  totalVisits: number;
}

// Decode the card ID from the QR JWT payload (client-side, no signature verification needed)
function decodeQRCardId(jwt: string): string | null {
  try {
    const [, payload] = jwt.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (decoded.type !== 'SCAN') return null;
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

export default function TopUpPage() {
  const { slug } = useParams<{ slug: string }>();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean; message: string; newBalanceMXN?: string; customer?: string;
  } | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string>('');
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanProcessing, setScanProcessing] = useState(false);

  function selectAmount(centavos: number) { setAmount(String(centavos / 100)); }

  // ── Camera ────────────────────────────────────────────────────────────────

  async function startCamera() {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanning(true);
      startQRDetection();
    } catch {
      setCameraError('No se pudo acceder a la cámara.');
    }
  }

  function stopCamera() {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
    setShowCamera(false);
  }

  function startQRDetection() {
    if (!('BarcodeDetector' in window)) {
      setCameraError('Tu dispositivo no soporta escaneo automático. Ingresa el número manualmente.');
      return;
    }
    const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    async function detect() {
      if (!videoRef.current || !streamRef.current) return;
      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx?.drawImage(videoRef.current, 0, 0);
        try {
          const barcodes = await detector.detect(canvas);
          if (barcodes.length > 0) {
            const value = barcodes[0].rawValue;
            if (value && value !== lastScannedRef.current) {
              lastScannedRef.current = value;
              await handleQRScanned(value);
              setTimeout(() => { lastScannedRef.current = ''; }, 3000);
            }
          }
        } catch {}
      }
      if (streamRef.current) rafRef.current = requestAnimationFrame(detect);
    }
    rafRef.current = requestAnimationFrame(detect);
  }

  async function handleQRScanned(payload: string) {
    setScanProcessing(true);
    const scannedCardId = decodeQRCardId(payload);
    if (!scannedCardId) {
      setCameraError('Código QR no válido. Asegúrate de escanear la tarjeta del cliente.');
      setScanProcessing(false);
      return;
    }

    // Look up the customer by card ID via the topup preview
    const token = localStorage.getItem('accessToken');
    if (!token) { setScanProcessing(false); return; }

    try {
      const res = await fetch(`/api/${slug}/admin/customers?search=${encodeURIComponent(scannedCardId)}&limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const found = (data.customers ?? []).find((c: CustomerSearchResult) => c.cardId === scannedCardId);
        if (found) {
          selectCustomer(found);
        } else {
          // Fallback: set cardId directly, name will appear in success response
          setCardId(scannedCardId);
          setShowCamera(false);
          stopCamera();
        }
      }
    } catch {
      setCardId(scannedCardId);
    } finally {
      setScanProcessing(false);
      stopCamera();
    }
  }

  useEffect(() => { return () => stopCamera(); }, []);

  // ── Customer search ───────────────────────────────────────────────────────

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);
    const token = localStorage.getItem('accessToken');
    if (!token) { setSearchLoading(false); return; }
    try {
      const res = await fetch(`/api/${slug}/admin/customers?search=${encodeURIComponent(search.trim())}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.customers ?? []);
      }
    } catch {}
    finally { setSearchLoading(false); }
  }

  function selectCustomer(c: CustomerSearchResult) {
    setSelectedCustomer(c);
    setCardId(c.cardId);
    setSearchResults([]);
    setSearch('');
    stopCamera();
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setCardId('');
    setResult(null);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

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
        setCardId(''); setAmount(''); setNote(''); setSelectedCustomer(null);
      } else {
        setResult({ success: false, message: data.error || 'Error al recargar' });
      }
    } catch {
      setResult({ success: false, message: 'Error de conexión' });
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-bold text-coffee-dark mt-4 mb-6">Recargar Saldo</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card-surface">
          <label className="block text-sm font-semibold text-coffee-dark mb-2">Cliente</label>

          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-coffee-pale rounded-xl px-3 py-2.5">
              <div>
                <p className="font-semibold text-coffee-dark text-sm">{selectedCustomer.name ?? 'Sin nombre'}</p>
                <p className="text-xs text-coffee-medium">{selectedCustomer.phone ?? selectedCustomer.email} · {selectedCustomer.cardNumber} · {selectedCustomer.balanceMXN}</p>
              </div>
              <button type="button" onClick={clearCustomer} className="text-coffee-light hover:text-red-500 ml-3 flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              {/* QR Camera */}
              {showCamera ? (
                <div className="mb-3">
                  <div className="relative bg-black rounded-xl overflow-hidden aspect-[4/3] mb-2">
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                    {scanning && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-44 h-44 border-2 border-coffee-light rounded-xl opacity-70">
                          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-coffee-light rounded-tl-lg" />
                          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-coffee-light rounded-tr-lg" />
                          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-coffee-light rounded-bl-lg" />
                          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-coffee-light rounded-br-lg" />
                        </div>
                      </div>
                    )}
                    {scanProcessing && (
                      <div className="absolute inset-0 bg-coffee-dark/60 flex items-center justify-center">
                        <div className="text-white text-center">
                          <svg className="w-8 h-8 mx-auto mb-2 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                            <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                          </svg>
                          <p className="text-sm">Buscando cliente...</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {cameraError && <p className="text-amber-700 text-sm text-center mb-2 bg-amber-50 rounded-lg px-3 py-2">{cameraError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={scanning ? stopCamera : startCamera} className={`flex-1 ${scanning ? 'btn-secondary' : 'btn-primary'}`}>
                      {scanning ? 'Detener cámara' : 'Activar cámara'}
                    </button>
                    <button type="button" onClick={stopCamera} className="btn-secondary px-4">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setShowCamera(true); setTimeout(startCamera, 100); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-coffee-pale text-coffee-medium hover:border-coffee-brand hover:text-coffee-brand transition-colors mb-3 text-sm font-medium"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" /><path d="M14 14h.01M14 17h.01M17 14h.01M17 17h.01M20 14h.01M20 17h.01M20 20h.01M17 20h.01M14 20h.01" />
                  </svg>
                  Escanear QR del cliente
                </button>
              )}

              {/* Text search */}
              <form onSubmit={handleSearch} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, teléfono o tarjeta..."
                  className="input-field flex-1"
                  autoFocus={!showCamera}
                />
                <button type="submit" disabled={!search.trim() || searchLoading} className="btn-secondary px-4 flex-shrink-0">
                  {searchLoading ? '...' : 'Buscar'}
                </button>
              </form>

              {searchResults.length > 0 && (
                <div className="border border-coffee-pale rounded-xl overflow-hidden divide-y divide-coffee-pale">
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-coffee-pale transition-colors"
                    >
                      <p className="font-medium text-coffee-dark text-sm">{c.name ?? 'Sin nombre'}</p>
                      <p className="text-xs text-coffee-medium">{c.phone ?? c.email} · {c.cardNumber} · {c.balanceMXN}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
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
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Otro monto, ej: 350" className="input-field" min="1" max="10000" step="0.01" required />
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
