/**
 * Apple Wallet pass generation using passkit-generator.
 *
 * SETUP REQUIRED:
 * 1. Apple Developer account ($99/year): https://developer.apple.com
 * 2. Create a Pass Type ID in the Certificates section
 * 3. Download the Pass Type ID certificate (.cer), convert to PEM:
 *    openssl x509 -in certificate.cer -inform DER -out signerCert.pem -outform PEM
 * 4. Export your private key as signerKey.pem
 * 5. Download Apple WWDR intermediate certificate:
 *    https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
 *    Convert: openssl x509 -in AppleWWDRCAG4.cer -inform DER -out wwdr.pem -outform PEM
 * 6. Place all .pem files in passes/apple/certificates/
 */

import { PKPass } from 'passkit-generator';
import fs from 'fs';
import path from 'path';
import { formatMXN } from './currency';
import { generateStampStrip } from './strip-generator';
import { generatePassSerial, generateRandomToken } from './auth';

const PASSES_DIR = path.join(process.cwd(), 'passes', 'apple');
const TEMPLATE_DIR = path.join(PASSES_DIR, 'template.pass');
const CERTS_DIR = path.join(PASSES_DIR, 'certificates');

// Cached at module load — reads from env vars (production) or filesystem (local dev)
const certCache = (() => {
  // Prefer env vars — certificates stored as base64 strings
  if (process.env.APPLE_SIGNER_CERT && process.env.APPLE_SIGNER_KEY && process.env.APPLE_WWDR_CERT) {
    return {
      wwdr: Buffer.from(process.env.APPLE_WWDR_CERT, 'base64'),
      signerCert: Buffer.from(process.env.APPLE_SIGNER_CERT, 'base64'),
      signerKey: Buffer.from(process.env.APPLE_SIGNER_KEY, 'base64'),
    };
  }
  // Fallback to filesystem for local development
  try {
    return {
      wwdr: fs.readFileSync(path.join(CERTS_DIR, 'wwdr.pem')),
      signerCert: fs.readFileSync(path.join(CERTS_DIR, 'signerCert.pem')),
      signerKey: fs.readFileSync(path.join(CERTS_DIR, 'signerKey.pem')),
    };
  } catch {
    return null;
  }
})();

export function isAppleWalletConfigured(): boolean {
  return certCache !== null && !!process.env.APPLE_PASS_TYPE_ID && !!process.env.APPLE_TEAM_ID;
}

export interface PassData {
  cardId: string;
  cardNumber: string;
  customerName: string;
  balanceCentavos: number;
  visitsThisCycle: number;
  visitsRequired: number;
  pendingRewards: number;
  rewardName: string;
  totalVisits: number;
  authToken?: string;
  serial?: string;
  // Tenant branding
  tenantName?: string;
  tenantSlug?: string;
  primaryColor?: string; // hex, e.g. "#B5605A"
  logoUrl?: string | null; // URL to tenant logo image
  stripImageUrl?: string | null; // URL to custom strip image
  passStyle?: string; // "default" or "stamps"
  stampFilledUrl?: string | null; // Custom filled stamp image URL
  stampEmptyUrl?: string | null; // Custom empty stamp image URL
  promoMessage?: string | null; // Current promotion text — triggers notification on change
}

export async function generateApplePass(data: PassData): Promise<{
  buffer: Buffer;
  serial: string;
  authToken: string;
}> {
  if (!isAppleWalletConfigured() || !certCache) {
    throw new Error('Apple Wallet certificates not configured. See passes/apple/certificates/README.md');
  }

  const serial = data.serial || generatePassSerial();
  const authToken = data.authToken || generateRandomToken();
  const tenantName = data.tenantName || 'Umi Cash';
  const tenantSlug = data.tenantSlug || 'app';

  // Convert hex color to rgb() string for Apple Wallet
  function hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const bgColor = hexToRgb(data.primaryColor || '#B5605A');

  const pass = await PKPass.from(
    {
      model: TEMPLATE_DIR,
      certificates: {
        wwdr: certCache.wwdr,
        signerCert: certCache.signerCert,
        signerKey: certCache.signerKey,
        signerKeyPassphrase: process.env.APPLE_KEY_PASSPHRASE || undefined,
      },
    } as any,
    {
      serialNumber: serial,
      authenticationToken: authToken,
      passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID || 'pass.co.umicash.loyalty',
      teamIdentifier: process.env.APPLE_TEAM_ID || '',
      organizationName: tenantName,
      description: `Tarjeta de lealtad ${tenantName}`,
      // logoText omitted — logo image is sufficient, text would duplicate the name
      backgroundColor: bgColor,
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(250, 235, 220)',
      webServiceURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/${tenantSlug}/passes/apple`,
    } as any
  );

  // Set pass type
  pass.type = 'storeCard';

  // Helper to resolve relative URLs and fetch image buffers
  async function fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const fullUrl = url.startsWith('/') ? `${process.env.NEXT_PUBLIC_APP_URL}${url}` : url;
      const res = await fetch(fullUrl);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      console.warn(`[Apple Pass] Image fetch failed: ${res.status} ${fullUrl}`);
    } catch (err) {
      console.warn('[Apple Pass] Image fetch error:', err);
    }
    return null;
  }

  const { default: sharp } = await import('sharp');

  // Generate notification icons with tenant primary color background
  const hex = data.primaryColor || '#B5605A';
  const ir = parseInt(hex.slice(1, 3), 16);
  const ig = parseInt(hex.slice(3, 5), 16);
  const ib = parseInt(hex.slice(5, 7), 16);
  const iconBg = { r: ir, g: ig, b: ib, alpha: 1 };

  // Add tenant logo if available — resize to crisp @2x dimensions
  const logoBuf = data.logoUrl ? await fetchImageBuffer(data.logoUrl) : null;
  if (logoBuf) {
    const resized = await sharp(logoBuf)
      .resize({ height: 50, withoutEnlargement: true })
      .png()
      .toBuffer();
    pass.addBuffer('logo@2x.png', resized);
  }

  // Icons: logo on colored background, or solid color fallback
  const iconSizes = [
    { name: 'icon.png', size: 29, logoSize: 20 },
    { name: 'icon@2x.png', size: 58, logoSize: 40 },
    { name: 'icon@3x.png', size: 87, logoSize: 60 },
  ];
  for (const { name, size, logoSize } of iconSizes) {
    const base = sharp({ create: { width: size, height: size, channels: 4, background: iconBg } });
    if (logoBuf) {
      const logoResized = await sharp(logoBuf).resize({ width: logoSize, height: logoSize, fit: 'inside' }).png().toBuffer();
      pass.addBuffer(name, await base.composite([{ input: logoResized, gravity: 'centre' }]).png().toBuffer());
    } else {
      pass.addBuffer(name, await base.png().toBuffer());
    }
  }

  // Add strip image: dynamic stamp card for "stamps" style, static image otherwise
  if (data.passStyle === 'stamps') {
    try {
      // Use tenant-specific stamp images: /logos/{slug}-stamp-filled.png
      const slug = data.tenantSlug || 'app';
      const filledUrl = data.stampFilledUrl || `/logos/${slug}-stamp-filled.png`;
      const emptyUrl = data.stampEmptyUrl || `/logos/${slug}-stamp-empty.png`;
      const stripBuf = await generateStampStrip(
        data.visitsThisCycle,
        data.visitsRequired,
        filledUrl,
        emptyUrl,
        data.primaryColor,
      );
      pass.addBuffer('strip@2x.png', stripBuf);
    } catch (err) {
      console.warn('[Apple Pass] Dynamic strip generation failed:', err);
    }
  } else if (data.stripImageUrl) {
    const stripBuf = await fetchImageBuffer(data.stripImageUrl);
    if (stripBuf) pass.addBuffer('strip@2x.png', stripBuf);
  }

  // Set barcode
  pass.setBarcodes({
    message: data.cardNumber,
    format: 'PKBarcodeFormatQR',
    messageEncoding: 'iso-8859-1',
    altText: data.cardNumber,
  });

  const remaining = data.visitsRequired - data.visitsThisCycle;

  // Balance header for all styles — changeMessage triggers lock screen notification
  pass.headerFields.push({ key: 'balance', label: 'SALDO', value: formatMXN(data.balanceCentavos), textAlignment: 'PKTextAlignmentRight', changeMessage: 'Tu saldo cambió a %@' });

  if (data.passStyle === 'stamps') {
    // Stamps style (Kalala): remaining stamps + pending rewards
    pass.secondaryFields.push({
      key: 'remaining',
      label: 'SELLOS FALTANTES',
      value: `${remaining} sello${remaining !== 1 ? 's' : ''}`,
      changeMessage: 'Sellos faltantes: %@',
    });
    pass.secondaryFields.push({
      key: 'rewards',
      label: 'Nº DE RECOMPENSAS',
      value: `${data.pendingRewards} premio${data.pendingRewards !== 1 ? 's' : ''}`,
      changeMessage: 'Recompensas disponibles: %@',
    });
  } else {
    // Default style (Ribera): member name + stamp dots
    const filled = '●'.repeat(data.visitsThisCycle);
    const empty = '○'.repeat(data.visitsRequired - data.visitsThisCycle);
    pass.secondaryFields.push({ key: 'memberName', label: 'MIEMBRO', value: data.customerName });
    pass.secondaryFields.push({ key: 'stamps', label: data.rewardName.toUpperCase(), value: `${filled}${empty} (${data.visitsThisCycle}/${data.visitsRequired})`, changeMessage: 'Progreso actualizado: %@' });
  }

  // Back fields
  // Promotion field on back — changeMessage still triggers lock screen notification
  pass.backFields.push({
    key: 'promo',
    label: 'Promoción',
    value: data.promoMessage || 'Sin promoción activa',
    changeMessage: '%@',
  });
  pass.backFields.push({ key: 'totalVisits', label: 'Visitas totales', value: String(data.totalVisits) });
  pass.backFields.push({ key: 'cardNumber', label: 'Número de tarjeta', value: data.cardNumber });
  pass.backFields.push({
    key: 'terms',
    label: 'Términos y condiciones',
    value: `Válido únicamente en ${tenantName}. El saldo no es reembolsable en efectivo. Las recompensas deben canjearse en tienda. El saldo no expira.`,
  });
  pass.backFields.push({
    key: 'developer',
    label: '',
    value: 'Developed by Umi Consulting',
  });
  const buffer = await pass.getAsBuffer();
  return { buffer, serial, authToken };
}
