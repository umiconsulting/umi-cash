// Sends WhatsApp messages via Twilio REST API (no SDK — same pattern as conversaflow-logs)

function getConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

function normalizeWhatsAppNumber(phone: string): string {
  // Strip formatting, ensure +52 prefix for MX numbers, wrap in whatsapp:
  const stripped = phone.replace(/[\s\-().]/g, '');
  const withCountry = stripped.startsWith('+') ? stripped : `+52${stripped}`;
  return `whatsapp:${withCountry}`;
}

export async function sendWhatsAppGiftCard(opts: {
  to: string;
  recipientName: string | null;
  senderName: string | null;
  tenantName: string;
  amountMXN: string;
  message: string | null;
  redeemUrl: string;
}): Promise<void> {
  const config = getConfig();
  if (!config) return; // Twilio not configured — skip silently

  const greeting = opts.recipientName ? `¡Hola ${opts.recipientName}! 👋` : '¡Hola! 👋';
  const from = opts.senderName ? `*${opts.senderName}*` : 'alguien especial';
  const messageLines = [
    greeting,
    `${from} te envió una tarjeta de regalo de *${opts.tenantName}* por *${opts.amountMXN}* 🎁`,
    opts.message ? `_"${opts.message}"_` : null,
    '',
    '👉 Canjéala aquí:',
    opts.redeemUrl,
  ].filter((l) => l !== null).join('\n');

  const authHeader = `Basic ${Buffer.from(`${config.sid}:${config.token}`).toString('base64')}`;

  const body = new URLSearchParams({
    From: config.from,
    To: normalizeWhatsAppNumber(opts.to),
    Body: messageLines,
  });

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }).then(async (r) => {
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.warn('[WhatsApp:giftcard]', r.status, err);
    }
  }).catch((err) => console.warn('[WhatsApp:giftcard]', err));
}
