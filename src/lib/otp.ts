import crypto from 'crypto';

/** Generate a cryptographically random 6-digit OTP */
export function generateOTP(): string {
  return String(crypto.randomInt(100000, 999999));
}

/** Hash OTP before storing — a DB leak won't expose valid codes */
export function hashOTP(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}
