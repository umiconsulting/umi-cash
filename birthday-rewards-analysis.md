# Birthday Rewards — Analysis & Strategy

## What Major Programs Do

| Program | Reward | Window | Notes |
|---------|--------|--------|-------|
| Starbucks | Free drink or food | Birthday + a few days | 30-day membership required |
| Panera | Free pastry | Birthday month | Generous but costly |
| Chick-fil-A | Free item (cookie, etc.) | ~1 week | Via app only |
| Dunkin' | Free drink | ~3 days around birthday | App-based |
| Denny's | Free Grand Slam | Birthday only | ID required in-store |
| Sephora | Birthday gift | Entire month | Retail example |

**Industry trend:** Most programs have moved to a **3–7 day redemption window** — month-long is too expensive and abuse-prone; single-day has poor redemption (~15–25%). A **birthday week** window hits ~40–55% redemption, the sweet spot.

---

## Engagement: When to Notify

| Timing | What | Channel |
|--------|------|---------|
| Day before birthday (evening) | "Your birthday treat is waiting!" | Apple/Google Wallet pass update (triggers lock-screen notification) + WhatsApp |
| Birthday morning (7 AM) | "Happy Birthday! Free [item] waiting for you" | WhatsApp |
| Day 3 post-birthday (if unredeemed) | "Your birthday reward expires in 4 days" | WhatsApp |
| Day 7 | Reward expires silently, removed from pass | — |

**Key insight for cafés:** Morning-visit businesses should send the birthday notification early AM — customer sees it, grabs their free coffee on the way to work.

---

## Vulnerabilities & Abuse Prevention

### 1. Fake birthday at registration
- **Risk: MEDIUM-HIGH** — Up to 15–30% of birthdays may be fake (clustered in January or close to registration date).
- **Mitigation:**
  - Require **30+ days of membership** before birthday reward activates
  - Do **not** allow birthday changes after registration (or limit to 1 change ever)
  - Don't reveal the reward value at signup — just say "birthday surprise"
  - Flag statistical anomalies (too many customers with same birthday)

### 2. Multiple accounts
- **Risk: MEDIUM** — Creating accounts with different birthdays.
- **Mitigation:**
  - Accounts tied to unique phone numbers (Umi already does this)
  - Require minimum activity (e.g., 3+ visits) before birthday eligibility

### 3. Sharing/transferring rewards
- **Risk: LOW** — Showing phone to a friend.
- **Mitigation:**
  - Redeemed by scanning the customer's loyalty pass (not transferable)
  - Staff can optionally verify name on pass
  - One-time server-side redemption — reward disappears after use

### 4. Recommended minimum requirements before eligibility
- Account age: **≥ 30 days**
- Minimum visits: **≥ 3 visits** (or 1 completed stamp cycle)
- Birthday data cannot be changed after registration

---

## Privacy & Legal (Mexico — LFPDPPP)

- Birth date is **personal data** (not sensitive) under Mexican law
- Standard consent and privacy notice requirements apply
- **Recommendation: Collect only birth month + day, not year** — sufficient for rewards, reduces data sensitivity
- Must be disclosed in the Aviso de Privacidad with purpose (loyalty program, birthday rewards)
- Customers have ARCO rights (Access, Rectify, Cancel, Oppose)
- Do not share birthday data with third parties

**Note:** Umi already collects full birthDate at registration. We should evaluate if we need the year — month + day is enough for birthday rewards.

---

## Alternative / Complementary Approaches

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Birthday week** (recommended) | Urgency + flexibility, proven redemption rates | Requires scheduling/cron | **Primary approach** |
| Anniversary ("Umi-versary") | Can't be faked, celebrates relationship | Less emotional resonance | Good supplement |
| Surprise & delight (random) | Strong emotional response, ungameable | No visit-driving urgency | Great complement |
| Milestone celebrations | Rewards actual loyalty | Less personal | Already built into stamp system |
| "Choose your celebration day" | Avoids birthday data | 100% gaming guaranteed | Not recommended |
| Tiered birthday rewards | Cost control, rewards best customers | More complexity | Consider for v2 |

---

## Messaging: Twilio Multi-Tenant Architecture

### Why Twilio for Both OTP + Birthday Messages

Twilio handles SMS auth (OTP) and transactional/marketing messages through the same API. A single Umi Twilio account serves all tenants — multi-tenancy lives in our database, not in Twilio.

### Sender Identity Options (Mexico)

| Approach | How it works | Pros | Cons |
|----------|-------------|------|------|
| **Single shared number** | One Twilio number for all tenants (+52 55 XXXX) | Cheapest (~$1/mo), simplest | Customers see same number for all brands |
| **Alphanumeric Sender ID** | Messages show "Kalala Café" instead of a number | Professional, branded | **Not supported in Mexico** |
| **Number per tenant** | Each café gets its own Twilio number | Full brand separation | ~$1 USD/mo per number, more management |
| **WhatsApp Business** | Single WhatsApp number with template messages | Rich media, ~90% open rates | Requires Meta approval per template |

**Recommendation:** Start with a **single shared Twilio number**. The tenant name in the message body provides enough brand context. Upgrade to per-tenant numbers or WhatsApp later if needed.

### How Multi-Tenancy Works

```
1. Cron job runs daily
2. Queries ALL tenants where birthdayRewardEnabled = true
3. For each tenant, finds eligible customers with birthday today
4. Per customer:
   a. Creates BirthdayReward record
   b. Updates Apple/Google Wallet pass (adds birthday field)
   c. Sends SMS via shared Twilio number:

   "¡Feliz cumpleaños, María! 🎂 Tu café de cortesía
    te espera en Kalala Café. Muestra tu tarjeta al
    barista. Válido 7 días."
```

The Twilio call is tenant-agnostic — tenant context is injected from the database:

```typescript
await twilioClient.messages.create({
  to: customer.phone,
  from: process.env.TWILIO_PHONE_NUMBER, // single shared number
  body: `¡Feliz cumpleaños, ${firstName}! 🎂 ${tenant.birthdayRewardName} te espera en ${tenant.name}. Muestra tu tarjeta. Válido 7 días.`,
});
```

### SMS Cost Estimate (Mexico)

| Volume | Per-SMS cost | Monthly estimate |
|--------|-------------|-----------------|
| 100 messages (OTP + birthday) | ~$0.03–0.05 USD | ~$4 USD |
| 500 messages | | ~$20 USD |
| 1,000 messages | | ~$40 USD |

Twilio number: ~$1 USD/month. Very affordable for small businesses.

### Notification Channels per Phase

| Phase | Birthday notification | OTP auth |
|-------|---------------------|----------|
| **Phase 1 (MVP)** | Wallet pass update (free, triggers iOS/Android lock-screen notification) + SMS via Twilio | SMS via Twilio |
| **Phase 2** | + WhatsApp Business API (richer, higher open rates) | + WhatsApp OTP option |

**Note on wallet pass updates:** Updating the Apple Wallet pass automatically triggers a lock-screen notification on iOS — no separate push infrastructure needed. Google Wallet also supports similar notifications. This is a **free** channel that already exists in our stack. SMS is the complementary channel for customers who haven't added the pass to their wallet.

### SMS Compliance (Mexico)

- Transactional messages (OTP, birthday rewards for opted-in loyalty members) do **not** require explicit opt-in under Mexican telecom rules — they are part of the service the customer signed up for.
- Marketing/promotional SMS **does** require opt-in. Birthday messages tied to a loyalty reward are transactional, not promotional.
- Include opt-out mechanism: `"Responde BAJA para no recibir mensajes."` in the first SMS to each customer.
- Umi's Aviso de Privacidad must mention SMS communications as a purpose of phone number collection.

---

## Recommended Implementation for Umi

### Phase 1 (MVP)
1. **Admin config per tenant:** Enable/disable birthday rewards, set the reward item name (e.g., "Café gratis", "Postre de cortesía")
2. **Eligibility rules:** 30-day membership + 3 minimum visits
3. **7-day window:** Starts on birthday, expires 7 days later
4. **One-time redemption:** Server-side enforcement, staff taps "Redeem" during scan
5. **Pass update:** Add "Birthday Reward" field to Apple/Google Wallet pass when active, remove after expiry
6. **Notification:** Wallet pass update (free lock-screen notification) + SMS via Twilio (shared number, tenant name in message body)
7. **SMS OTP auth:** Same Twilio account, same shared number

### Phase 2 (Future)
- WhatsApp Business API for birthday messages (richer, higher open rates)
- WhatsApp OTP as alternative to SMS
- Per-tenant Twilio numbers (if tenants want branded sender identity)
- Tiered rewards based on customer loyalty level
- Birthday analytics per tenant (redemption rate, visit lift)
- Surprise & delight random rewards

### Database changes needed
- `Tenant`: `birthdayRewardEnabled`, `birthdayRewardName`, `birthdayRewardMinDays`, `birthdayRewardMinVisits`
- `LoyaltyCard` or new `BirthdayReward` table: `birthdayRewardYear` (track which year was redeemed), `redeemedAt`

### Cron/scheduled job (Vercel Cron)
- **Daily at 7:00 AM CST** (`0 13 * * *` UTC): Check all tenants for birthday-eligible customers → create reward + update wallet pass + send SMS
- **Daily at midnight CST** (`0 6 * * *` UTC): Expire rewards past the 7-day window → update wallet pass to remove birthday field
- Reminder SMS on day 3 post-birthday if unredeemed

### Staff UX
- Scan screen shows banner: **"REGALO DE CUMPLEAÑOS — [reward name]"** when active
- One-tap "Canjear" button to redeem
- No judgment calls for staff — system handles all eligibility

---

## Risks & Open Questions

1. **We currently store full birthDate** — should we migrate to month+day only? (Privacy benefit, but may want age verification later)
2. **Cron jobs on Vercel** — need Vercel Cron for the daily birthday check (already available, 1/day is fine for Hobby plan, up to 2 crons)
3. **Pass update volume** — if 50 customers have birthdays in a month, that's ~2 pass updates/day for the birthday check. Minimal load.
4. **What if customer registers ON their birthday?** — 30-day rule means they wait until next year. This is intentional and prevents gaming.
5. **What about Feb 29 birthdays?** — Treat as March 1 in non-leap years.
6. **Twilio number selection** — need a Mexican mobile number (+52) for best deliverability. Twilio offers these.
7. **SMS delivery in rural Mexico** — some carriers may have delays. Wallet pass update is the primary channel; SMS is supplementary.
