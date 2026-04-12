/**
 * Google Wallet loyalty pass generation.
 *
 * Classes are pre-created via the REST API (see setup script).
 * The JWT save URL only contains the loyalty object.
 */

import { SignJWT } from 'jose';
import { signWalletBarcode } from './auth';

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID || '';
const CLASS_ID_PREFIX = process.env.GOOGLE_WALLET_CLASS_ID || 'loyalty_v2';
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cash.umiconsulting.co';

export function isGoogleWalletConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    process.env.GOOGLE_WALLET_ISSUER_ID
  );
}

export interface GooglePassData {
  cardId: string;
  cardNumber: string;
  customerName: string;
  balanceCentavos: number;
  visitsThisCycle: number;
  visitsRequired: number;
  pendingRewards: number;
  rewardName: string;
  totalVisits: number;
  memberSince: string;
  tenantName?: string;
  tenantSlug?: string;
  primaryColor?: string;
  logoUrl?: string | null;
}

function getClassId(tenantSlug?: string): string {
  return `${ISSUER_ID}.${tenantSlug ? `${tenantSlug}_${CLASS_ID_PREFIX}` : CLASS_ID_PREFIX}`;
}

function getLoyaltyObject(data: GooglePassData) {
  const remaining = data.visitsRequired - data.visitsThisCycle;
  const objectId = `${ISSUER_ID}.card_${data.cardId}`;

  return {
    id: objectId,
    classId: getClassId(data.tenantSlug),
    state: 'active',
    accountId: data.cardNumber,
    accountName: data.customerName || 'Cliente',
    loyaltyPoints: {
      balance: {
        string: String(data.visitsThisCycle),
      },
      label: `Visitas (meta: ${data.visitsRequired})`,
    },
    barcode: {
      type: 'qrCode',
      value: signWalletBarcode(data.cardNumber),
      alternateText: data.cardNumber,
    },
    textModulesData: [
      {
        header: 'Recompensa',
        body: data.pendingRewards > 0
          ? `${data.pendingRewards} disponible${data.pendingRewards > 1 ? 's' : ''}`
          : `${remaining} visita${remaining !== 1 ? 's' : ''} para ${data.rewardName}`,
      },
    ],
    linksModuleData: {
      uris: [
        {
          kind: 'walletobjects#uri',
          uri: `${APP_URL}/${data.tenantSlug || ''}/card`,
          description: 'Ver mi tarjeta',
        },
      ],
    },
  };
}

export async function generateGoogleWalletURL(data: GooglePassData): Promise<string> {
  if (!isGoogleWalletConfigured()) {
    throw new Error('Google Wallet not configured. Set GOOGLE_SERVICE_ACCOUNT_* env vars.');
  }

  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n').trim();
  const privateKeyBase64 = privateKeyRaw.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----|-----END (?:RSA )?PRIVATE KEY-----|\n|\r/g, '');
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(privateKeyBase64, 'base64'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const loyaltyObject = getLoyaltyObject(data);

  console.log('[Google Wallet] Class ID:', loyaltyObject.classId);
  console.log('[Google Wallet] Object ID:', loyaltyObject.id);

  const payload = {
    iss: SERVICE_ACCOUNT_EMAIL,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [APP_URL],
    payload: {
      loyaltyObjects: [loyaltyObject],
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
    console.error('[Google Wallet] Update failed:', err instanceof Error ? err.message : String(err));
  }
}
