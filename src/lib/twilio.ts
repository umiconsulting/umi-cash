/** Twilio SMS via REST API — no SDK needed */

const ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const PHONE_FROM = (process.env.TWILIO_PHONE_FROM || '').trim();

export function isTwilioConfigured(): boolean {
  return !!(ACCOUNT_SID && AUTH_TOKEN && PHONE_FROM);
}

export async function sendSMS(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!isTwilioConfigured()) {
    return { ok: false, error: 'Twilio not configured' };
  }

  const authHeader = `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: PHONE_FROM, To: to, Body: body }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Twilio SMS]', res.status, err);
    return { ok: false, error: err.message || `HTTP ${res.status}` };
  }

  return { ok: true };
}
