/**
 * Google Wallet loyalty pass generation.
 *
 * SETUP REQUIRED:
 * 1. Google Cloud project: https://console.cloud.google.com
 * 2. Enable "Google Wallet API" in APIs & Services
 * 3. Create a Service Account with "Google Wallet Object Issuer" role
 * 4. Download the service account JSON key
 * 5. Apply for Google Wallet Issuer access: https://pay.google.com/business/console
 * 6. Set environment variables:
 *    GOOGLE_SERVICE_ACCOUNT_EMAIL
 *    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 *    GOOGLE_WALLET_ISSUER_ID
 *    GOOGLE_WALLET_CLASS_ID
 */

import { SignJWT } from 'jose';
import { formatMXN } from './currency';

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID || '';
const CLASS_ID = process.env.GOOGLE_WALLET_CLASS_ID || 'elgranribera_loyalty_v1';
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com';

export function isGoogleWalletConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    process.env.GOOGLE_WALLET_ISSUER_ID
  );
}

function getLoyaltyClass(tenantName: string, primaryColor: string) {
  return {
    id: `${ISSUER_ID}.${CLASS_ID}`,
    issuerName: tenantName,
    programName: 'Programa de Lealtad',
    programLogo: {
      sourceUri: {
        uri: `${APP_URL}/logo-wallet.png`,
      },
      contentDescription: {
        defaultValue: {
          language: 'es-MX',
          value: `${tenantName} logo`,
        },
      },
    },
    hexBackgroundColor: primaryColor,
    countryCode: 'MX',
    reviewStatus: 'UNDER_REVIEW',
    linksModuleData: {
      uris: [
        {
          uri: `${APP_URL}/card`,
          description: 'Ver mi tarjeta',
          id: 'card_link',
        },
      ],
    },
  };
}

// Keep old signature for internal use, updated below

interface GooglePassData {
  cardId: string;
  cardNumber: string;
  customerName: string;
  balanceCentavos: number;
  visitsThisCycle: number;
  visitsRequired: number;
  pendingRewards: number;
  rewardName: string;
  totalVisits: number;
  memberSince: string; // ISO date string
  // Tenant branding
  tenantName?: string;
  tenantSlug?: string;
  primaryColor?: string; // hex
}

function getLoyaltyObject(data: GooglePassData) {
  const remaining = data.visitsRequired - data.visitsThisCycle;
  const objectId = `${ISSUER_ID}.card_${data.cardId}`;

  return {
    id: objectId,
    classId: `${ISSUER_ID}.${CLASS_ID}`,
    state: 'ACTIVE',
    accountId: data.cardNumber,
    accountName: data.customerName || 'Cliente',
    loyaltyPoints: {
      balance: {
        int: data.visitsThisCycle,
      },
      label: `Visitas (meta: ${data.visitsRequired})`,
    },
    secondaryLoyaltyPoints: {
      balance: {
        money: {
          currencyCode: 'MXN',
          // Google Wallet uses micros (millionths of currency unit)
          // $1 MXN = 1,000,000 micros; centavos × 10,000 = micros
          micros: data.balanceCentavos * 10_000,
        },
      },
      label: 'Saldo regalo',
    },
    textModulesData: [
      {
        header: 'PRÓXIMA RECOMPENSA',
        body:
          data.pendingRewards > 0
            ? `${data.pendingRewards} recompensa${data.pendingRewards > 1 ? 's' : ''} disponible${data.pendingRewards > 1 ? 's' : ''} — ¡canjéala en tienda!`
            : `${remaining} visita${remaining !== 1 ? 's' : ''} más para obtener: ${data.rewardName}`,
        id: 'reward_progress',
      },
      {
        header: 'RECOMPENSA ACTUAL',
        body: data.rewardName,
        id: 'reward_name',
      },
    ],
    barcode: {
      type: 'QR_CODE',
      value: data.cardNumber,
      alternateText: `Tarjeta ${data.cardNumber}`,
    },
    infoModuleData: {
      labelValueRows: [
        {
          columns: [
            { label: 'Total de visitas', value: String(data.totalVisits) },
            {
              label: 'Miembro desde',
              value: new Intl.DateTimeFormat('es-MX', {
                month: 'long',
                year: 'numeric',
                timeZone: 'America/Mexico_City',
              }).format(new Date(data.memberSince)),
            },
          ],
        },
      ],
    },
  };
}

export async function generateGoogleWalletURL(data: GooglePassData): Promise<string> {
  if (!isGoogleWalletConfigured()) {
    throw new Error('Google Wallet not configured. Set GOOGLE_SERVICE_ACCOUNT_* env vars.');
  }

  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(privateKeyRaw.replace(/-----BEGIN RSA PRIVATE KEY-----|-----END RSA PRIVATE KEY-----|\n/g, ''), 'base64'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const payload = {
    iss: SERVICE_ACCOUNT_EMAIL,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    payload: {
      loyaltyClasses: [getLoyaltyClass(data.tenantName || 'Umi Cash', data.primaryColor || '#B5605A')],
      loyaltyObjects: [getLoyaltyObject(data)],
    },
  };

  const jwt = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'RS256' })
    .sign(privateKey);

  return `https://pay.google.com/gp/v/save/${jwt}`;
}

// Singleton — GoogleAuth and its OAuth client are expensive to re-create on every wallet update
let googleAuthClient: any = null;
async function getGoogleAuthToken(): Promise<string> {
  if (!googleAuthClient) {
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
    });
    googleAuthClient = await auth.getClient();
  }
  const token = await googleAuthClient.getAccessToken();
  return token.token as string;
}

export async function updateGoogleWalletObject(data: GooglePassData): Promise<void> {
  if (!isGoogleWalletConfigured()) return;

  try {
    const objectId = `${ISSUER_ID}.card_${data.cardId}`;
    const object = getLoyaltyObject(data);
    const token = await getGoogleAuthToken();

    await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(object),
      }
    );
  } catch (err) {
    console.error('[Google Wallet] Update failed:', err);
    // Non-fatal: pass will update on next open
  }
}
