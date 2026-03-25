'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ScanResult } from '@/types/api';
import { SCAN_ACTIONS, type ScanAction } from '@/lib/constants';

export default function ScanPage() {
  const { slug } = useParams<{ slug: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [action, setAction] = useState<ScanAction>(SCAN_ACTIONS.VISIT);
  const [manualInput, setManualInput] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [processing, setProcessing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScannedRef = useRef<string>('');
  const rafRef = useRef<number | null>(null);

  async function startCamera() {
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
    if (!('BarcodeDetector' in window)) return;
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
              await processQR(value);
              setTimeout(() => { lastScannedRef.current = ''; }, 3000);
            }
          }
        } catch {}
      }
      if (streamRef.current) rafRef.current = requestAnimationFrame(detect);
    }
    rafRef.current = requestAnimationFrame(detect);
  }

  async function processQR(payload: string) {
    if (processing) return;
    setProcessing(true);
    setResult(null);

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      const res = await fetch(`/api/${slug}/admin/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ qrPayload: payload, action }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, action, message: data.error, customer: { name: null, cardNumber: '' }, card: { visitsThisCycle: 0, visitsRequired: 10, pendingRewards: 0, balanceMXN: '' } });
      } else {
        setResult({ ...data, success: true });
      }
    } catch {
      setResult({ success: false, action, message: 'Error de conexión', customer: { name: null, cardNumber: '' }, card: { visitsThisCycle: 0, visitsRequired: 10, pendingRewards: 0, balanceMXN: '' } });
    } finally {
      setProcessing(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualInput) return;
    await processQR(manualInput.trim());
    setManualInput('');
  }

  useEffect(() => { return () => stopCamera(); }, []);

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-bold text-coffee-dark mt-4 mb-6">Escanear Tarjeta</h1>

      {/* Action selector */}
      <div className="card-surface mb-4">
        <p className="text-sm font-semibold text-coffee-dark mb-3">Acción:</p>
        <div className="flex gap-3">
          <button
            onClick={() => setAction('VISIT')}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
              action === 'VISIT' ? 'bg-coffee-dark text-white' : 'bg-coffee-pale text-coffee-medium hover:bg-coffee-light/30'
            }`}
          >
            Registrar visita
          </button>
          <button
            onClick={() => setAction('REDEEM')}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
              action === 'REDEEM' ? 'bg-coffee-brand text-white' : 'bg-coffee-pale text-coffee-medium hover:bg-coffee-light/30'
            }`}
          >
            Canjear recompensa
          </button>
        </div>
      </div>

      {/* Camera */}
      <div className="card-surface mb-4">
        <div className="relative bg-black rounded-xl overflow-hidden aspect-square mb-3">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {!scanning && (
            <div className="absolute inset-0 flex items-center justify-center bg-coffee-dark/80">
              <div className="text-center text-white">
                <svg className="w-10 h-10 mx-auto mb-2 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <p className="text-sm">Cámara apagada</p>
              </div>
            </div>
          )}
          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-2 border-coffee-light rounded-xl opacity-70">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-coffee-light rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-coffee-light rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-coffee-light rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-coffee-light rounded-br-lg" />
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
                <p className="text-sm">Procesando...</p>
              </div>
            </div>
          )}
        </div>

        {cameraError && <p className="text-red-600 text-sm text-center mb-3">{cameraError}</p>}

        <button onClick={scanning ? stopCamera : startCamera} className={scanning ? 'btn-secondary w-full' : 'btn-primary w-full'}>
          {scanning ? 'Detener cámara' : 'Activar cámara'}
        </button>
      </div>

      {/* Manual input */}
      <div className="card-surface mb-4">
        <p className="text-sm font-semibold text-coffee-dark mb-2">O ingresa el número de tarjeta:</p>
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input type="text" value={manualInput} onChange={(e) => setManualInput(e.target.value)} placeholder="EGR-1234567890" className="input-field flex-1" />
          <button type="submit" disabled={!manualInput || processing} className="btn-primary px-4">→</button>
        </form>
      </div>

      {/* Result */}
      {result && (
        <div className={`card-surface border-2 animate-slide-up ${
          result.success
            ? result.rewardEarned ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50'
            : 'border-red-400 bg-red-50'
        }`}>
          <div className="text-center">
            <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center ${
              result.success ? result.rewardEarned ? 'bg-coffee-brand' : 'bg-green-500' : 'bg-red-500'
            }`}>
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {result.success
                  ? <polyline points="20 6 9 17 4 12" />
                  : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
              </svg>
            </div>
            <p className={`font-semibold ${result.success ? 'text-green-800' : 'text-red-800'}`}>{result.message}</p>
            {result.success && result.customer.name && (
              <p className="text-sm text-gray-600 mt-1">Cliente: {result.customer.name}</p>
            )}
            {result.success && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="font-bold text-coffee-dark">{result.card.visitsThisCycle}/{result.card.visitsRequired}</p>
                  <p className="text-coffee-medium">Visitas</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="font-bold text-coffee-dark">{result.card.pendingRewards}</p>
                  <p className="text-coffee-medium">Recompensas</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="font-bold text-coffee-dark">{result.card.balanceMXN}</p>
                  <p className="text-coffee-medium">Saldo</p>
                </div>
              </div>
            )}
            <button
              onClick={() => setResult(null)}
              className="mt-4 w-full py-2 rounded-xl text-sm font-semibold bg-coffee-dark text-white hover:bg-coffee-medium transition-colors"
            >
              Siguiente cliente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
