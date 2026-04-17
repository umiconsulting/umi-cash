# Twilio SMS OTP Verification — Implementation Guide

## Current State

- **Registration**: Phone number collected but **not verified** — anyone can register with any number
- **Twilio already in use**: WhatsApp notifications via raw HTTP (no SDK), env vars `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` already set
- **Auth system**: JWT access tokens (15 min) + refresh tokens (30 days), scrypt password hashing for staff/admin
- **Rate limiting**: Already implemented in `src/lib/rate-limit.ts`
- **Phone parsing**: `libphonenumber-js` already installed

## Why SMS OTP?

1. **Prevents fake registrations** — no more junk phone numbers inflating customer counts
2. **Enables SMS marketing** — verified numbers can receive birthday rewards, promotions
3. **Account recovery** — customers can log back in via OTP (no password needed)
4. **Multi-tenant trust** — tenants know their customer data is real

---

## Architecture

### Option A: Twilio Verify API (Recommended)

Twilio's managed OTP service — handles code generation, delivery, rate limiting, and fraud detection.

**Pros:**
- No OTP storage in our DB (Twilio manages state)
- Built-in fraud guard (blocks known bad numbers, pumping detection)
- Supports SMS, WhatsApp, and email channels
- Automatic code expiration (10 min default)
- Twilio handles retry/resend logic

**Cons:**
- $0.05 per verification (send + check = 1 verification)
- Requires creating a Verify Service in Twilio Console

**API flow:**
```
POST https://verify.twilio.com/v2/Services/{ServiceSID}/Verifications
  To: "+526674147163"
  Channel: "sms"
→ Returns: { sid, status: "pending" }

POST https://verify.twilio.com/v2/Services/{ServiceSID}/VerificationCheck
  To: "+526674147163"
  Code: "123456"
→ Returns: { status: "approved" | "pending" }
```

### Option B: Self-managed OTP via Twilio Messaging API

Send raw SMS with our own generated code, store/verify ourselves.

**Pros:**
- Cheaper per SMS (~$0.0079/msg to Mexico)
- Full control over code format, expiration, templates
- No extra Twilio service to configure

**Cons:**
- Must build: code generation, storage, expiration, brute-force protection
- Must handle: retry throttling, phone number validation, fraud prevention
- More code to maintain

### Recommendation: **Option A (Twilio Verify)** for launch, migrate to Option B later if cost becomes a factor at scale.

---

## Twilio Verify — Multi-Tenant Design

### Single Verify Service, Shared Number

All tenants share **one Twilio Verify Service** and **one phone number/short code**. The OTP message is generic (just the code), so no tenant branding conflict.

```
Env vars (shared, not per-tenant):
  TWILIO_ACCOUNT_SID=AC...
  TWILIO_AUTH_TOKEN=...
  TWILIO_VERIFY_SERVICE_SID=VA...   ← NEW
```

**Why single service?**
- Twilio Verify messages are standardized: "Your verification code is: 123456"
- No tenant name in the SMS (Twilio controls the template for approved short codes)
- Simpler to manage — one service, one set of rate limits
- Per-tenant services would be overkill and harder to maintain

### Custom Templates (Optional, Later)

If tenants want branded messages, Twilio Verify supports custom templates per service. But this requires Twilio approval and is only worth it at scale. For now, the default template works fine.

---

## Database Changes

### New Model: OTP Tracking (Optional with Verify API)

With Twilio Verify, we don't strictly need DB storage for codes. But we should track verification status on the User:

```prisma
model User {
  // ... existing fields ...
  phoneVerifiedAt  DateTime?   // null = unverified
}
```

### Rate Limit Tracking (Use Existing Pattern)

The existing `src/lib/rate-limit.ts` in-memory rate limiter handles this. Add specific limits:
- 3 OTP sends per phone per 10 minutes
- 5 OTP verify attempts per phone per 10 minutes
- 10 OTP sends per IP per hour

---

## Implementation Plan

### Phase 1: Registration with OTP (Core)

**New files:**
- `src/lib/twilio.ts` — Twilio Verify helper (send OTP, check OTP)
- `src/app/api/[slug]/auth/send-otp/route.ts` — POST endpoint to trigger SMS
- `src/app/api/[slug]/auth/verify-otp/route.ts` — POST endpoint to validate code

**Modified files:**
- `src/app/[slug]/(auth)/register/page.tsx` — Add OTP step between phone input and account creation
- `src/app/api/[slug]/customers/route.ts` — Require verified phone before creating user
- `prisma/schema.prisma` — Add `phoneVerifiedAt` to User

#### Flow:

```
1. User fills form (name, phone, birthday)
2. Client POST /api/{slug}/auth/send-otp  { phone: "+526674147163" }
   → Server calls Twilio Verify → SMS sent
   → Returns { success: true }
3. UI shows 6-digit code input
4. Client POST /api/{slug}/auth/verify-otp  { phone, code: "123456" }
   → Server calls Twilio VerificationCheck
   → If approved: returns { verified: true, verificationToken: "..." }
5. Client POST /api/{slug}/customers  { name, phone, birthDate, verificationToken }
   → Server validates verificationToken (short-lived JWT proving phone ownership)
   → Creates user with phoneVerifiedAt = now()
   → Returns accessToken + card
```

The `verificationToken` is a short-lived JWT (5 min) containing the verified phone number. This prevents:
- Replay attacks (token expires)
- Phone spoofing (token is signed, tied to specific phone)
- Race conditions (verify once, register once)

#### `src/lib/twilio.ts` (Verify API wrapper):

```typescript
const ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const VERIFY_SID = (process.env.TWILIO_VERIFY_SERVICE_SID || '').trim();

export function isTwilioVerifyConfigured(): boolean {
  return !!(ACCOUNT_SID && AUTH_TOKEN && VERIFY_SID);
}

export async function sendOTP(phone: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${VERIFY_SID}/Verifications`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Channel: 'sms' }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    return { success: false, error: err.message };
  }
  return { success: true };
}

export async function checkOTP(phone: string, code: string): Promise<boolean> {
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${VERIFY_SID}/VerificationCheck`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Code: code }),
    }
  );
  if (!res.ok) return false;
  const data = await res.json();
  return data.status === 'approved';
}
```

### Phase 2: Customer Login via OTP

Once registration requires OTP, login becomes natural:

```
1. Customer enters phone number
2. Server sends OTP
3. Customer enters code
4. Server verifies → creates session → returns tokens
```

**New file:**
- `src/app/api/[slug]/auth/customer-login/route.ts`

**Modified:**
- `src/app/[slug]/(auth)/login/page.tsx` — Add "Iniciar sesión con teléfono" option (or make it the default for customers)

This replaces the current "magic" auto-login where registration returns a token. Customers who clear their browser can log back in.

### Phase 3: Birthday SMS & Promotional Messages

Once phone numbers are verified, tenants can send:
- **Birthday rewards**: Automated SMS on customer's birthday with reward code
- **Re-engagement**: "Te extrañamos" messages after X days of inactivity
- **Reward notifications**: "¡Ganaste tu recompensa!" when cycle completes

These use the regular **Twilio Messaging API** (not Verify), same pattern as `src/lib/whatsapp.ts`:

```typescript
export async function sendSMS(to: string, body: string): Promise<boolean> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: process.env.TWILIO_PHONE_FROM!,
        To: to,
        Body: body,
      }),
    }
  );
  return res.ok;
}
```

**Multi-tenant message personalization:**
```typescript
// Message includes tenant name from DB, not from a per-tenant Twilio config
const msg = `🎂 ¡Feliz cumpleaños, ${customer.name}! ${tenant.name} te regala ${reward}. Muestra este mensaje en tienda.`;
await sendSMS(customer.phone, msg);
```

---

## Cost Estimate

### Twilio Verify (OTP)
| Item | Cost | Notes |
|------|------|-------|
| Per verification | $0.05 | Includes send + check |
| 100 registrations/month | $5.00 | Early stage |
| 1,000 registrations/month | $50.00 | Growth stage |

### Twilio SMS (Marketing/Birthday)
| Item | Cost | Notes |
|------|------|-------|
| SMS to Mexico | ~$0.0079/msg | Outbound |
| SMS to US/Canada | ~$0.0079/msg | Outbound |
| Phone number (shared) | $1.15/month | Single number for all tenants |
| 1,000 birthday SMS/month | ~$7.90 | At scale |

### Total estimate (early stage): ~$7-10/month

---

## Env Vars to Add

```
TWILIO_VERIFY_SERVICE_SID=VA...     # From Twilio Console → Verify → Services
TWILIO_PHONE_FROM=+1...             # For marketing SMS (not OTP — Verify uses its own)
```

## Twilio Console Setup

1. **Create Verify Service**: Console → Verify → Services → Create
   - Friendly name: "Umi Cash"
   - Code length: 6
   - Expiration: 10 minutes
   - Copy the Service SID (VA...)
2. **Buy a phone number** (for marketing SMS, not OTP):
   - Console → Phone Numbers → Buy a Number
   - Choose US number with SMS capability ($1.15/month)
   - Mexican numbers are more expensive (~$14/month) but show a local number
3. **Enable geo-permissions**: Console → Messaging → Geo Permissions
   - Enable Mexico, US, and any other target countries

---

## UX Flow (Registration)

```
┌─────────────────────────────┐
│  Crea tu tarjeta            │
│                             │
│  Nombre: [María García    ] │
│  Cumpleaños: [1990-05-15  ] │
│  Teléfono: 🇲🇽+52 [55 1234]│
│  ☑ Acepto términos          │
│                             │
│  [ Verificar teléfono ]     │
└─────────────────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Verificación               │
│                             │
│  Enviamos un código a       │
│  +52 55 1234 5678           │
│                             │
│  Código: [  1 2 3 4 5 6  ] │
│                             │
│  [ Verificar y crear ]      │
│                             │
│  ¿No llegó? Reenviar (45s)  │
└─────────────────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  ¡Listo, María!             │
│  Tu tarjeta está activa.    │
│                             │
│  [Guardar en Apple Wallet ] │
│  [Guardar en Google Wallet] │
└─────────────────────────────┘
```

---

## Security Considerations

1. **Rate limiting**: Already have in-memory rate limiter; apply per-phone and per-IP limits on OTP endpoints
2. **Toll fraud / SMS pumping**: Twilio Verify has built-in fraud guard; for self-managed, add CAPTCHA or proof-of-work before sending
3. **Verification token**: Short-lived JWT (5 min) prevents phone number spoofing between verify and register steps
4. **Brute force**: Twilio Verify auto-locks after 5 failed attempts per verification; for self-managed, implement lockout
5. **Number recycling**: Phone numbers get reassigned; `phoneVerifiedAt` timestamp helps — if a user hasn't verified in 6+ months, re-verify on next login
6. **Cost attack**: An attacker could trigger OTP sends to expensive international numbers; restrict to allowed country codes (already have country selector in UI)

---

## Graceful Degradation

If Twilio Verify is not configured (`TWILIO_VERIFY_SERVICE_SID` not set), registration should still work without OTP — just like today. This allows:
- Local development without Twilio credentials
- Gradual rollout per tenant
- Fallback if Twilio has an outage

```typescript
// In registration API
if (isTwilioVerifyConfigured()) {
  // Require verificationToken
} else {
  // Skip phone verification (current behavior)
}
```

---

## Timeline Estimate

| Phase | Scope | Files Changed |
|-------|-------|---------------|
| Phase 1 | Registration OTP | ~5 files, 1 migration |
| Phase 2 | Customer login via OTP | ~3 files |
| Phase 3 | Birthday/marketing SMS | ~4 files, 1 cron job |
