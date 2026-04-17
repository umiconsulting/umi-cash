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

## Feature Design: How Birthday Rewards Work in Umi

### Core Flow

1. **Trigger:** Cron job runs daily at 7 AM CST. For each tenant with `birthdayRewardEnabled = true`, it finds customers whose birthday matches today's date (month + day).
2. **Notification:** The customer's Apple/Google Wallet pass is updated with a birthday reward field — this automatically triggers a lock-screen notification. No SMS needed; the wallet push is free and sufficient.
3. **Wallet message example:**
   > *"¡Feliz cumpleaños, María! 🎂 Tienes un regalo especial en El Gran Ribera — canjéalo una sola vez durante este mes."*
4. **Redemption:** Customer visits the café any time during their birthday month. Staff scans the loyalty pass — the scan screen shows a **"REGALO DE CUMPLEAÑOS"** banner with a one-tap "Canjear" button.
5. **One-time only:** Once the staff taps "Canjear," the reward is marked redeemed server-side **immediately and permanently**. The wallet pass updates in real time to remove the birthday field. The customer **cannot redeem again** — not at the same visit, not at a different visit within the window, not at a future date.
6. **Expiry (if unredeemed):** At the end of the customer's birthday month, an expiry cron removes the birthday field from the wallet pass. The reward is gone for this birthday year; it resets next year.

### Key Rules

| Rule | Detail |
|------|--------|
| **One gift per birthday year** | Tracked by `birthdayRewardYear` — one redemption allowed per customer per calendar year |
| **Strictly one-time** | Server enforces: once `redeemedAt` is set, no further redemption is possible regardless of window |
| **Birthday month window** | Active from birthday (day 1), expires end of the birthday month |
| **Wallet pass = only notification** | Free lock-screen push via pass update; no SMS for birthday rewards |
| **Immediate pass update on redemption** | Wallet pass clears birthday field the moment staff redeems — no delay |
| **Eligibility guards** | Any registered customer with birthday data on file |

### Abuse Scenarios Covered by One-Time Enforcement

- Customer shows pass to multiple staff members → second "Canjear" tap returns an error: *"Este regalo ya fue canjeado"*
- Customer visits twice in the same week → reward is already gone after first visit
- Customer tries next year's birthday early → `birthdayRewardYear` must be the current calendar year

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
  - Accounts tied to unique phone numbers (Umi already does this — one account per number)

### 3. Sharing/transferring rewards
- **Risk: LOW** — Showing phone to a friend.
- **Mitigation:**
  - Redeemed by scanning the customer's loyalty pass (not transferable)
  - Staff can optionally verify name on pass
  - One-time server-side redemption — reward disappears after use

### 4. Recommended minimum requirements before eligibility
- Birthday data on file (collected at registration)
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

### Twilio for OTP Only

Birthday reward notifications are delivered exclusively via wallet pass updates (free, zero marginal cost). Twilio is used only for SMS OTP authentication. A single Umi Twilio account serves all tenants — multi-tenancy lives in our database, not in Twilio.

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
   b. Updates Apple/Google Wallet pass (adds birthday field — triggers free lock-screen notification)

   "¡Feliz cumpleaños, María! 🎂 Tu café de cortesía
    te espera en Kalala Café. Muestra tu tarjeta al
    barista. Válido 7 días."
```

### SMS Cost Estimate (Mexico — OTP only)

| Volume | Per-SMS cost | Monthly estimate |
|--------|-------------|-----------------|
| 100 OTP messages | ~$0.03–0.05 USD | ~$4 USD |
| 500 OTP messages | | ~$20 USD |
| 1,000 OTP messages | | ~$40 USD |

Twilio number: ~$1 USD/month. Birthday rewards add zero SMS cost since they use wallet pass updates.

### Notification Channels per Phase

| Phase | Birthday notification | OTP auth |
|-------|---------------------|----------|
| **Phase 1 (MVP)** | Wallet pass update (free, triggers iOS/Android lock-screen notification) | SMS via Twilio |
| **Phase 2** | + WhatsApp Business API (richer, higher open rates) | + WhatsApp OTP option |

**Note on wallet pass updates:** Updating the Apple Wallet pass automatically triggers a lock-screen notification on iOS — no separate push infrastructure needed. Google Wallet also supports similar notifications. This is a **free** channel that already exists in our stack.

---

## Recommended Implementation for Umi

### Phase 1 (MVP)
1. **Admin config per tenant:** Enable/disable birthday rewards, set the reward item name (e.g., "Café gratis", "Postre de cortesía")
2. **Eligibility rules:** Any registered customer with birthday data on file
3. **Birthday month window:** Active from the customer's birthday, expires at end of the birthday month; unredeemed rewards expire silently
4. **Strictly one-time redemption:** Server sets `redeemedAt` on first "Canjear" tap; any subsequent redemption attempt returns an error — no exceptions
5. **Pass update on redemption:** Wallet pass birthday field is removed immediately when redeemed (not just at expiry)
6. **Pass update on birthday:** Add "Birthday Reward" field to Apple/Google Wallet pass at 7 AM CST on birthday — triggers free lock-screen notification
7. **`birthdayRewardYear` tracking:** Prevents double-issuance within the same calendar year
8. **SMS OTP auth:** Twilio used for OTP only — birthday rewards use wallet pass notifications (free)

### Phase 2 (Future)
- WhatsApp Business API for birthday messages (richer, higher open rates)
- WhatsApp OTP as alternative to SMS
- Per-tenant Twilio numbers (if tenants want branded sender identity)
- Tiered rewards based on customer loyalty level
- Birthday analytics per tenant (redemption rate, visit lift)
- Surprise & delight random rewards

### Database changes needed
- `Tenant`: `birthdayRewardEnabled`, `birthdayRewardName`
- New `BirthdayReward` table (one row per customer per year):
  - `id`, `loyaltyCardId`, `tenantId`
  - `birthdayRewardYear` — calendar year (e.g., 2026); enforces one reward per year via unique constraint on `(loyaltyCardId, tenantId, birthdayRewardYear)`
  - `issuedAt` — when the reward was created and pass was updated
  - `expiresAt` — last day of the birthday month (e.g., birthday May 31 → expires May 31; birthday May 5 → expires May 31)
  - `redeemedAt` — null until redeemed; once set, redemption is closed permanently
  - `status` — enum: `ACTIVE | REDEEMED | EXPIRED`

### Cron/scheduled job (Vercel Cron)
- **Daily at 7:00 AM CST** (`0 13 * * *` UTC): Check all tenants for birthday-eligible customers → create reward + update wallet pass (triggers lock-screen notification)
- **Daily at midnight CST** (`0 6 * * *` UTC): Expire rewards where `expiresAt` has passed (end of birthday month) → update wallet pass to remove birthday field


### Staff UX
- Scan screen shows banner: **"REGALO DE CUMPLEAÑOS — [reward name]"** when active
- One-tap "Canjear" button to redeem
- No judgment calls for staff — system handles all eligibility

---

## Risks & Open Questions

1. **We currently store full birthDate** — should we migrate to month+day only? (Privacy benefit, but may want age verification later)
2. **Cron jobs on Vercel** — need Vercel Cron for the daily birthday check (already available, 1/day is fine for Hobby plan, up to 2 crons)
3. **Pass update volume** — if 50 customers have birthdays in a month, that's ~2 pass updates/day for the birthday check. Minimal load.
4. **What if customer registers ON their birthday?** — They are immediately eligible and will receive the reward that same day if the cron has not yet run, or next year if it already ran.
5. **What about Feb 29 birthdays?** — Treat as March 1 in non-leap years.
6. **Customers without a wallet pass** — rare edge case; they won't receive the birthday notification. Consider a Phase 2 WhatsApp nudge for this segment.
