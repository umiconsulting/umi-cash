import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('Missing JWT_ACCESS_SECRET');
  return new TextEncoder().encode(secret);
}

export async function requireUmiAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('umi_session')?.value;
  if (!token) redirect('/umi/login');
  try {
    await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
  } catch {
    redirect('/umi/login');
  }
}

export async function verifyUmiSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get('umi_session')?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}
