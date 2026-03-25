import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, timingSafeEqual, scryptSync } from 'crypto';
import { NextRequest } from 'next/server';
import { prisma } from './prisma';

function requireSecret(name: string, value: string | undefined): Uint8Array {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  if (value.length < 32) throw new Error(`${name} must be at least 32 characters`);
  return new TextEncoder().encode(value);
}

const ACCESS_SECRET = requireSecret('JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET);
const REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);
const QR_SECRET = requireSecret('APP_QR_SECRET', process.env.APP_QR_SECRET);

export type JWTPayload = {
  sub: string;
  role: string;
  tenantId: string;
  iat?: number;
  exp?: number;
};

export function generateRandomToken(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

export function generatePassSerial(): string {
  return randomBytes(8).toString('hex').toUpperCase();
}

export async function signAccessToken(userId: string, role: string, tenantId: string): Promise<string> {
  return new SignJWT({ sub: userId, role, tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(ACCESS_SECRET);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(REFRESH_SECRET);
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET, { algorithms: ['HS256'] });
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, REFRESH_SECRET, { algorithms: ['HS256'] });
    return payload as { sub: string };
  } catch {
    return null;
  }
}

export async function getAuthUser(req: NextRequest): Promise<JWTPayload | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyAccessToken(authHeader.slice(7));
}

export function requireAuth(roles?: string[]) {
  return async (req: NextRequest): Promise<JWTPayload | null> => {
    const user = await getAuthUser(req);
    if (!user) return null;
    if (roles && !roles.includes(user.role)) return null;
    return user;
  };
}

// scrypt-based password hashing (memory-hard, resistant to GPU attacks)
// Format: "scrypt:salt:hash" — detected by prefix
// Legacy SHA256 format: "salt:hash" (no prefix) — supported for read, never written
export function hashPassword(password: string): string {
  const salt = generateRandomToken(16);
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    if (stored.startsWith('scrypt:')) {
      const parts = stored.split(':');
      if (parts.length !== 3) return false;
      const [, salt, expectedHash] = parts;
      const computedHash = scryptSync(password, salt, 64);
      return timingSafeEqual(Buffer.from(expectedHash, 'hex'), computedHash);
    }
    // Legacy SHA256 format
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const computed = createHash('sha256').update(password + salt).digest('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const computedBuf = Buffer.from(computed, 'hex');
    if (hashBuf.length !== computedBuf.length) return false;
    return timingSafeEqual(hashBuf, computedBuf);
  } catch {
    return false;
  }
}

export async function createSession(
  userId: string,
  role: string,
  tenantId: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(userId, role, tenantId),
    signRefreshToken(userId),
  ]);
  await prisma.session.create({
    data: {
      userId,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  return { accessToken, refreshToken };
}

export async function signQRPayload(cardId: string, qrToken: string): Promise<string> {
  return new SignJWT({ sub: cardId, tok: qrToken, type: 'SCAN' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(QR_SECRET);
}

export async function verifyQRPayload(
  payload: string
): Promise<{ cardId: string; qrToken: string; isWalletScan: boolean } | null> {
  try {
    const { payload: p } = await jwtVerify(payload, QR_SECRET, { algorithms: ['HS256'] });
    const data = p as { sub: string; tok: string; type: string };
    return { cardId: data.sub, qrToken: data.tok, isWalletScan: false };
  } catch {
    if (/^[A-Z]+-\d+$/.test(payload)) {
      return { cardId: payload, qrToken: '', isWalletScan: true };
    }
    return null;
  }
}
