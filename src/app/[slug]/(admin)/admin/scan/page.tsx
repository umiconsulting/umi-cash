'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import jsQR from 'jsqr';
import { centavosFromPesos, formatMXN, COMMON_TOPUP_AMOUNTS } from '@/lib/currency';

interface CardPreview {
  cardId: string;
  cardNumber: string;
  qrPayload: string;
  customer: { name: string | null };
  card: {
    visitsThisCycle: number;
    visitsRequired: number;
    pendingRewards: number;
    balanceMXN: string;
    balanceCentavos: number;
    rewardName: string;
    visitLimitReached: boolean;
        lastVisitAt: string | null;
  };
}

interface ActionResult {
  success: boolean;
  message: string;
  detail?: string;
  newBalanceMXN?: string;
}

export default function ScanPage() {
  const { slug } = useParams<{ slug: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string>('');

  const [manualInput, setManualInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [processing, setProcessing] = useState(false);

  // Step 2: preview loaded
  const [preview, setPreview] = useState<CardPreview | null>(null);

  // Step 3: action result
  const [result, setResult] = useState<ActionResult | null>(null);

  // Cobrar saldo flow
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeNote, setChargeNote] = useState('');
  const [showCharge, setShowCharge] = useState(false);

  // Recargar saldo flow
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');
  const [showTopup, setShowTopup] = useState(false);

  // ── Camera ──────────────────────────────────────────────────────────────

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
      setCameraError('No se pudo acceder a la cámara. Usa el campo manual.');
    }
  }

  function stopCamera() {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  function startQRDetection() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const useBarcodeDetector = 'BarcodeDetector' in window;
    const detector = useBarcodeDetector
      ? new (window as any).BarcodeDetector({ formats: ['qr_code'] })
      : null;

    async function detect() {
      if (!videoRef.current || !streamRef.current) return;
      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx?.drawImage(videoRef.current, 0, 0);

        let value: string | null = null;
        try {
          if (detector) {
            const barcodes = await detector.detect(canvas);
            if (barcodes.length > 0) value = barcodes[0].rawValue;
          } else if (ctx) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, canvas.width, canvas.height);
            if (code) value = code.data;
          }
        } catch {}

        if (value && value !== lastScannedRef.current) {
          lastScannedRef.current = value;
          await loadPreview(value);
          setTimeout(() => { lastScannedRef.current = ''; }, 3000);
        }
      }
      if (streamRef.current) rafRef.current = requestAnimationFrame(detect);
    }
    rafRef.current = requestAnimationFrame(detect);
  }

  useEffect(() => { return () => stopCamera(); }, []);

  // ── Preview ──────────────────────────────────────────────────────────────

  async function loadPreview(payload: string) {
    if (processing) return;
    setProcessing(true);
    setResult(null);
    setShowCharge(false);
    setChargeAmount('');
    setShowTopup(false);
    setTopupAmount('');

    const token = localStorage.getItem('accessToken');
    if (!token) { setProcessing(false); return; }

    try {
      const res = await fetch(`/api/${slug}/admin/scan/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ qrPayload: payload }),
      });

      const data = await res.json();
      if (res.ok) {
        setPreview(data);
        stopCamera();
      } else {
        setResult({ success: false, message: data.error ?? 'Error al leer la tarjeta' });
      }
    } catch {
      setResult({ success: false, message: 'Error de conexión' });
    } finally {
      setProcessing(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualInput.trim()) return;
    await loadPreview(manualInput.trim());
    setManualInput('');
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function doVisit() {
    if (!preview) return;
    setProcessing(true);
    setResult(null);
    const token = localStorage.getItem('accessToken');
    if (!token) { setProcessing(false); return; }

    try {
      const res = await fetch(`/api/${slug}/admin/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ qrPayload: preview.qrPayload, action: 'VISIT' }),
      });
      const data = await res.json();
      setResult({ success: res.ok, message: data.message ?? data.error });
      if (res.ok) setPreview(null);
    } catch {
      setResult({ success: false, message: 'Error de conexión' });
    } finally {
      setProcessing(false);
    }
  }

  async function doRedeem() {
    if (!preview) return;
    setProcessing(true);
    setResult(null);
    const token = localStorage.getItem('accessToken');
    if (!token) { setProcessing(false); return; }

    try {
      const res = await fetch(`/api/${slug}/admin/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ qrPayload: preview.qrPayload, action: 'REDEEM' }),
      });
      const data = await res.json();
      setResult({ success: res.ok, message: data.message ?? data.error });
      if (res.ok) setPreview(null);
    } catch {
      setResult({ success: false, message: 'Error de conexión' });
    } finally {
      setProcessing(false);
    }
  }

  async function doCharge(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setProcessing(true);
    setResult(null);
    const token = localStorage.getItem('accessToken');
    if (!token) { setProcessing(false); return; }

    let amountCentavos: number;
    try { amountCentavos = centavosFromPesos(chargeAmount); } catch {
      setResult({ success: false, message: 'Monto inválido' });
      setProcessing(false);
      return;
    }

    try {
      const res = await fetch(`/api/${slug}/admin/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cardId: preview.cardId, amountCentavos, note: chargeNote }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, message: `Cobrado: ${data.amountMXN}`, detail: `Nuevo saldo: ${data.newBalanceMXN}` });
        setPreview(null);
        setShowCharge(false);
        setChargeAmount('');
        setChargeNote('');
      } else {
        setResult({ success: false, message: data.error ?? 'Error al cobrar' });
      }
    } catch {
      setResult({ success: false, message: 'Error de conexión' });
    } finally {
      setProcessing(false);
    }
  }

  async function doTopup(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setProcessing(true);
    setResult(null);
    const token = localStorage.getItem('accessToken');
    if (!token) { setProcessing(false); return; }

    let amountCentavos: number;
    try { amountCentavos = centavosFromPesos(topupAmount); } catch {
      setResult({ success: false, message: 'Monto inválido' });
      setProcessing(false);
      return;
    }

    try {
      const res = await fetch(`/api/${slug}/admin/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cardId: preview.cardId, amountCentavos, note: topupNote }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, message: `Recarga exitosa: ${data.amountMXN}`, detail: `Nuevo saldo: ${data.newBalanceMXN}` });
        setPreview(null);
        setShowTopup(false);
        setTopupAmount('');
        setTopupNote('');
      } else {
        setResult({ success: false, message: data.error ?? 'Error al recargar' });
      }
    } catch {
      setResult({ success: false, message: 'Error de conexión' });
    } finally {
      setProcessing(false);
    }
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setShowCharge(false);
    setChargeAmount('');
    setChargeNote('');
    setShowTopup(false);
    setTopupAmount('');
    setTopupNote('');
    setManualInput('');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const progressPct = preview
    ? Math.round((preview.card.visitsThisCycle / preview.card.visitsRequired) * 100)
    : 0;

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-bold text-coffee-dark mt-4 mb-6">Escanear Tarjeta</h1>

      {/* ── Step 1: scan input (hidden once preview is loaded) ── */}
      {!preview && !result && (
        <>
          {/* Manual input */}
          <div className="card-surface mb-4">
            <p className="text-sm font-semibold text-coffee-dark mb-2">Número de tarjeta:</p>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Tarjeta o teléfono"
                className="input-field flex-1"
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                disabled={processing}
              />
              <button type="submit" disabled={!manualInput || processing} className="btn-primary px-4">
                {processing ? '...' : '→'}
              </button>
            </form>
            <p className="text-xs text-coffee-light mt-1.5">Ingresa número de tarjeta o teléfono, o escanea el QR.</p>
          </div>

          {/* Camera */}
          <div className="card-surface mb-4">
            <div className="relative bg-black rounded-xl overflow-hidden aspect-[4/3] mb-3">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              {!scanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-coffee-dark/80">
                  <div className="text-center text-white">
                    <svg className="w-10 h-10 mx-auto mb-2 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <p className="text-sm">Cámara apagada</p>
                  </div>
                </div>
              )}
              {scanning && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-44 h-44 border-2 border-white/60 rounded-xl">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg" />
                  </div>
                </div>
              )}
              {processing && (
                <div className="absolute inset-0 bg-coffee-dark/60 flex items-center justify-center">
                  <div className="text-white text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                    </svg>
                    <p className="text-sm">Leyendo tarjeta...</p>
                  </div>
                </div>
              )}
            </div>
            {cameraError && <p className="text-amber-700 text-sm text-center mb-3 bg-amber-50 rounded-lg px-3 py-2">{cameraError}</p>}
            <button onClick={scanning ? stopCamera : startCamera} className={scanning ? 'btn-secondary w-full' : 'btn-primary w-full'}>
              {scanning ? 'Detener cámara' : 'Activar cámara'}
            </button>
          </div>
        </>
      )}

      {/* ── Step 2: customer card + actions ── */}
      {preview && !result && (
        <div className="space-y-4 animate-slide-up">
          {/* Customer info card */}
          <div className="card-surface">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-bold text-coffee-dark text-lg leading-tight">
                  {preview.customer.name ?? 'Cliente'}
                </p>
                <p className="text-xs text-coffee-medium font-mono mt-0.5">{preview.cardNumber}</p>
              </div>
              <button onClick={reset} className="text-coffee-light hover:text-coffee-dark p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-coffee-pale rounded-xl p-3 text-center">
                <p className="font-bold text-coffee-dark text-lg leading-none">
                  {preview.card.visitsThisCycle}<span className="text-coffee-medium text-sm font-normal">/{preview.card.visitsRequired}</span>
                </p>
                <p className="text-xs text-coffee-medium mt-1">Visitas</p>
              </div>
              <div className="bg-coffee-pale rounded-xl p-3 text-center">
                <p className="font-bold text-coffee-dark text-lg leading-none">{preview.card.pendingRewards}</p>
                <p className="text-xs text-coffee-medium mt-1">Recompensas</p>
              </div>
              <div className="bg-coffee-pale rounded-xl p-3 text-center">
                <p className="font-bold text-coffee-dark text-lg leading-none">{preview.card.balanceMXN}</p>
                <p className="text-xs text-coffee-medium mt-1">Saldo</p>
              </div>
            </div>

            {/* Visit progress bar */}
            <div className="w-full bg-coffee-pale rounded-full h-1.5 mb-1">
              <div
                className="bg-coffee-brand h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-coffee-medium">
              {preview.card.visitsRequired - preview.card.visitsThisCycle} visita{preview.card.visitsRequired - preview.card.visitsThisCycle !== 1 ? 's' : ''} para {preview.card.rewardName}
            </p>
          </div>

          {/* Cobrar saldo form (inline) */}
          {showCharge ? (
            <div className="card-surface border-2 border-coffee-brand/20 bg-coffee-brand/5">
              <p className="text-sm font-semibold text-coffee-dark mb-3">Cobrar saldo</p>
              <form onSubmit={doCharge} className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {COMMON_TOPUP_AMOUNTS.map(({ label, centavos }) => (
                    <button
                      key={centavos}
                      type="button"
                      onClick={() => setChargeAmount(String(centavos / 100))}
                      disabled={centavos > preview.card.balanceCentavos}
                      className={`py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-30 ${
                        chargeAmount === String(centavos / 100) ? 'bg-coffee-dark text-white' : 'bg-white text-coffee-medium hover:bg-coffee-pale'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                  placeholder="Otro monto"
                  className="input-field"
                  min="0.01"
                  max={preview.card.balanceCentavos / 100}
                  step="0.01"
                  autoFocus
                />
                {chargeAmount && !isNaN(parseFloat(chargeAmount)) && (
                  <p className="text-sm text-coffee-medium -mt-1">= {formatMXN(Math.round(parseFloat(chargeAmount) * 100))}</p>
                )}
                <input
                  type="text"
                  value={chargeNote}
                  onChange={(e) => setChargeNote(e.target.value)}
                  placeholder="Nota (opcional)"
                  className="input-field"
                  maxLength={200}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowCharge(false); setChargeAmount(''); }} className="btn-secondary flex-1">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!chargeAmount || processing || parseFloat(chargeAmount) <= 0}
                    className="btn-primary flex-1"
                  >
                    {processing ? 'Procesando...' : 'Confirmar cobro'}
                  </button>
                </div>
              </form>
            </div>

          /* Recargar saldo form (inline) */
          ) : showTopup ? (
            <div className="card-surface border-2 border-green-200 bg-green-50/50">
              <p className="text-sm font-semibold text-coffee-dark mb-3">Recargar saldo</p>
              <form onSubmit={doTopup} className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {COMMON_TOPUP_AMOUNTS.map(({ label, centavos }) => (
                    <button
                      key={centavos}
                      type="button"
                      onClick={() => setTopupAmount(String(centavos / 100))}
                      className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                        topupAmount === String(centavos / 100) ? 'bg-coffee-dark text-white' : 'bg-white text-coffee-medium hover:bg-coffee-pale'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="Otro monto"
                  className="input-field"
                  min="1"
                  max="10000"
                  step="0.01"
                  autoFocus
                />
                {topupAmount && !isNaN(parseFloat(topupAmount)) && (
                  <p className="text-sm text-coffee-medium -mt-1">= {formatMXN(Math.round(parseFloat(topupAmount) * 100))}</p>
                )}
                <input
                  type="text"
                  value={topupNote}
                  onChange={(e) => setTopupNote(e.target.value)}
                  placeholder="Nota (opcional)"
                  className="input-field"
                  maxLength={200}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowTopup(false); setTopupAmount(''); }} className="btn-secondary flex-1">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!topupAmount || processing || parseFloat(topupAmount) <= 0}
                    className="w-full flex-1 bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors active:scale-95 transform disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing ? 'Procesando...' : 'Confirmar recarga'}
                  </button>
                </div>
              </form>
            </div>

          ) : (
            /* Action buttons */
            <div className="space-y-2">
              {/* Register visit */}
              <button
                onClick={doVisit}
                disabled={processing || preview.card.visitLimitReached}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-coffee-dark text-white font-semibold text-sm disabled:opacity-40 hover:bg-coffee-medium transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="flex-1 text-left">
                  {preview.card.visitLimitReached
                    ? (() => {
                        if (!preview.card.lastVisitAt) return 'Visita ya registrada hoy';
                        const minsLeft = Math.ceil((new Date(preview.card.lastVisitAt).getTime() + 24 * 60 * 60 * 1000 - Date.now()) / 60000);
                        const hrsLeft = Math.floor(minsLeft / 60);
                        const remaining = hrsLeft > 0 ? `${hrsLeft}h ${minsLeft % 60}m` : `${minsLeft}m`;
                        return `Disponible en ${remaining}`;
                      })()
                    : 'Registrar visita'}
                </span>
                {!preview.card.visitLimitReached && (
                  <span className="text-white/50 text-xs">
                    {preview.card.visitsThisCycle + 1}/{preview.card.visitsRequired}
                  </span>
                )}
              </button>

              {/* Top up balance */}
              <button
                onClick={() => setShowTopup(true)}
                disabled={processing}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-green-600 text-white font-semibold text-sm disabled:opacity-40 hover:bg-green-700 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span className="flex-1 text-left">Recargar saldo</span>
                <span className="text-white/70 text-xs">{preview.card.balanceMXN} actual</span>
              </button>

              {/* Charge balance */}
              <button
                onClick={() => setShowCharge(true)}
                disabled={processing || preview.card.balanceCentavos === 0}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-coffee-brand text-white font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
                <span className="flex-1 text-left">
                  {preview.card.balanceCentavos === 0 ? 'Sin saldo disponible' : 'Cobrar saldo'}
                </span>
                {preview.card.balanceCentavos > 0 && (
                  <span className="text-white/70 text-xs">{preview.card.balanceMXN} disp.</span>
                )}
              </button>

              {/* Redeem reward */}
              <button
                onClick={doRedeem}
                disabled={processing || preview.card.pendingRewards === 0}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-amber-400 text-amber-700 font-semibold text-sm disabled:opacity-40 hover:bg-amber-50 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span className="flex-1 text-left">
                  {preview.card.pendingRewards === 0 ? 'Sin recompensas pendientes' : `Canjear recompensa`}
                </span>
                {preview.card.pendingRewards > 0 && (
                  <span className="text-amber-500 text-xs">{preview.card.rewardName}</span>
                )}
              </button>

              {processing && (
                <p className="text-center text-sm text-coffee-medium animate-pulse pt-1">Procesando...</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: result ── */}
      {result && (
        <div className={`card-surface border-2 animate-slide-up ${result.success ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
          <div className="text-center">
            <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center ${result.success ? 'bg-green-500' : 'bg-red-500'}`}>
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {result.success
                  ? <polyline points="20 6 9 17 4 12" />
                  : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
              </svg>
            </div>
            <p className={`font-semibold ${result.success ? 'text-green-800' : 'text-red-800'}`}>{result.message}</p>
            {result.detail && <p className="text-sm text-gray-600 mt-1">{result.detail}</p>}
            <button onClick={reset} className="mt-4 w-full py-2 rounded-xl text-sm font-semibold bg-coffee-dark text-white hover:bg-coffee-medium transition-colors">
              Siguiente cliente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
