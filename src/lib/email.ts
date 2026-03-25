import { Resend } from 'resend';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const FROM = process.env.EMAIL_FROM ?? 'Umi Cash <noreply@umiconsulting.co>';

export async function sendWelcomeEmail(opts: {
  to: string;
  customerName: string;
  tenantName: string;
  cardNumber: string;
  slug: string;
  appUrl: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend || !opts.to.includes('@')) return;
  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `¡Bienvenido a ${opts.tenantName}! Tu tarjeta está lista.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#B5605A">¡Hola, ${escapeHtml(opts.customerName)}!</h2>
        <p>Tu tarjeta de lealtad para <strong>${escapeHtml(opts.tenantName)}</strong> está lista.</p>
        <p style="font-family:monospace;background:#f5f0eb;padding:12px;border-radius:8px;text-align:center;font-size:18px;letter-spacing:2px">${escapeHtml(opts.cardNumber)}</p>
        <p style="color:#999;font-size:12px;margin-top:24px">Muestra el código QR de tu tarjeta en cada visita para acumular puntos.</p>
      </div>
    `,
  }).catch((err) => console.warn('[Email:welcome]', err));
}

export async function sendRewardEarnedEmail(opts: {
  to: string;
  customerName: string;
  tenantName: string;
  rewardName: string;
  slug: string;
  appUrl: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend || !opts.to.includes('@')) return;
  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `🎉 ¡Ganaste una recompensa en ${opts.tenantName}!`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#B5605A">¡Felicidades, ${escapeHtml(opts.customerName)}!</h2>
        <p>Has ganado: <strong>${escapeHtml(opts.rewardName)}</strong> en <strong>${escapeHtml(opts.tenantName)}</strong>.</p>
        <p>Muestra tu tarjeta del wallet al barista para canjearla.</p>
        <p style="color:#999;font-size:12px;margin-top:24px">Si no solicitaste esto, ignora este mensaje.</p>
      </div>
    `,
  }).catch((err) => console.warn('[Email:reward]', err));
}
