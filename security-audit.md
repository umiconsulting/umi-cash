# Security Audit & Fraud Prevention — Umi Cash

**Date:** 2026-04-10
**Scope:** Full platform audit + industry research on loyalty program fraud

---

## Current Protections (Already Implemented)

| Protection | Status | Details |
|---|---|---|
| Single-use QR tokens | OK | `qrToken` rotated after each scan |
| Time-expiring QR (5 min JWT) | OK | JWT with `setExpirationTime('5m')` |
| 60-second wallet replay guard | OK | Checks recent visit within 60s |
| 24-hour visit cooldown | OK | Max 1 visit per card per 24h |
| Staff auth required for scans | OK | `requireAuth(['STAFF', 'ADMIN'])` |
| Self-scan prevention | OK | Staff can't scan their own card |
| Audit trail | OK | `staffId` recorded on every visit/redemption |
| Login rate limiting | OK | 10 attempts per 15 min per IP |
| Umi admin rate limiting | OK | 5 attempts per 10 min per IP |
| Purchase amount validation | OK | Zod validates min/max on topup/purchase |
| Prisma transactions | OK | Balance operations are atomic |

---

## CRITICAL Vulnerabilities

### 1. Customer login requires NO verification
- **File:** `src/app/api/[slug]/auth/login/route.ts`
- **Issue:** Customers log in with just a phone number — no password, no OTP, no verification
- **Impact:** Anyone who knows a phone number can access that customer's account, see their balance, redeem rewards
- **Fix:** Add SMS OTP or at minimum a PIN set during registration

### 2. No rate limiting on customer registration
- **File:** `src/app/api/[slug]/customers/route.ts`
- **Issue:** No rate limiting. Attacker can create thousands of fake accounts with sequential phone numbers
- **Impact:** Database spam, reward farming across multiple fake accounts
- **Fix:** Add IP-based rate limiting (max 3 registrations per IP per hour) + CAPTCHA

### 3. No phone verification on registration
- **File:** `src/app/api/[slug]/customers/route.ts`
- **Issue:** Phone number is accepted without any verification (no OTP, no callback)
- **Impact:** Fake accounts, account takeover (register with someone else's number)
- **Fix:** SMS OTP (Twilio ~$0.15 MXN/msg) or staff-confirmed registration

### 4. Wallet scan accepts bare card number (weak verification)
- **File:** `src/app/api/[slug]/admin/scan/route.ts:51-55`
- **Issue:** `isWalletScan` path accepts card numbers matching `^[A-Z]+-\d+$` with no cryptographic token — just a format check
- **Impact:** Anyone who knows/guesses a card number format (e.g., `EGR-1234567890`) could forge a scan
- **Fix:** Embed a rotating HMAC or short-lived token in the wallet barcode

### 5. Reward redemption has no idempotency protection
- **File:** `src/app/api/[slug]/admin/scan/route.ts:93-117`
- **Issue:** No unique constraint on `RewardRedemption`. Network retry could redeem same reward twice
- **Impact:** Double redemption — customer gets 2 rewards for 1 cycle
- **Fix:** Add idempotency key or unique constraint (e.g., `@@unique([cardId, createdAt])` with time window)

---

## HIGH Vulnerabilities

### 6. Gift card code entropy too low + no rate limiting
- **File:** `src/app/api/[slug]/admin/gift-cards/route.ts:21-25` and `src/app/api/[slug]/gift/[code]/route.ts`
- **Issue:** Codes are 8 bytes (64 bits). GET endpoint leaks amount/sender without auth. No rate limiting on redemption attempts
- **Fix:** Increase to 16 bytes (128 bits), add rate limiting, require auth for GET

### 7. No CSRF token protection
- **File:** `src/middleware.ts`
- **Issue:** Only origin header check, no CSRF tokens on state-changing endpoints
- **Fix:** Add `SameSite=Strict` cookies (already done for umi_session) + CSRF tokens for sensitive operations

### 8. Staff daily topup limit bypassable
- **File:** `src/app/api/[slug]/admin/topup/route.ts:60-68`
- **Issue:** $5,000 MXN daily limit is per staff member. Multiple staff accounts can coordinate
- **Fix:** Add per-card daily topup limit in addition to per-staff limit

### 9. No staff activity monitoring
- **File:** N/A (missing feature)
- **Issue:** No dashboard showing scans per staff, anomalous patterns, after-hours activity
- **Impact:** Staff fraud (collusion, fake visits) goes undetected
- **Fix:** Add staff activity report in analytics

### 10. Tenant suspension is fire-and-forget
- **File:** `src/lib/tenant.ts:44-47`
- **Issue:** Auto-suspension on trial expiry uses `.catch(() => {/* ignore */})` — if it fails, tenant stays active
- **Fix:** Use synchronous check or retry logic

---

## MEDIUM Vulnerabilities

### 11. No business hours enforcement for scans
- **Issue:** Visits can be registered at any hour (3 AM scan is likely fraudulent)
- **Fix:** Optional business hours config per tenant, warn/block out-of-hours scans

### 12. No device fingerprinting
- **Issue:** Same person can create unlimited accounts from same device/browser
- **Fix:** Basic browser fingerprint (User-Agent + screen + timezone) to limit 1-2 accounts per device

### 13. No Content-Security-Policy headers
- **Fix:** Add CSP headers in `next.config.js`

### 14. Session cleanup depends on cron
- **File:** `src/app/api/cron/cleanup-sessions/route.ts`
- **Issue:** If Vercel cron not configured, expired sessions accumulate
- **Fix:** Also clean up during auth checks

### 15. Gift card phone normalization inconsistency
- **File:** `src/app/api/[slug]/gift/[code]/route.ts:64-77`
- **Issue:** Phone number matching tries multiple variants, could match wrong account
- **Fix:** Normalize all phone numbers to E.164 format on registration

---

## LOW Vulnerabilities

### 16. No account lockout after failed logins
- Only IP-based, no per-account lockout
- Distributed attack possible

### 17. Apple Pass device registration not verified
- Any device with leaked serial+token can register

### 18. Cron secret has no rotation policy
- Static env var, no expiration

### 19. Missing audit logging on some operations
- Topup and balance changes have transaction records but no structured audit log

---

## Fraud Vectors by Actor

### Customer Fraud
| Attack | Current Protection | Gap |
|---|---|---|
| Fake accounts (multiple phones) | Phone uniqueness per tenant | No phone verification |
| QR screenshot sharing | Single-use tokens + 5min expiry | Wallet scan accepts bare card number |
| Visit farming (multiple accounts) | 24h cooldown per card | No device fingerprint, no phone OTP |
| Reward double-redemption | pendingRewards counter | No idempotency key |
| Account takeover | Rate-limited login | No password/OTP required |

### Staff Fraud
| Attack | Current Protection | Gap |
|---|---|---|
| Scanning without purchase | Audit trail (staffId) | No monitoring dashboard |
| Self-scanning | Blocked (userId check) | None |
| After-hours fake scans | None | No business hours check |
| Topup to self/friends | $5k daily limit per staff | No per-card limit, no alerts |
| Colluding with customers | Audit trail | No anomaly detection |

---

## Recommended Action Plan (Priority Order)

### Phase 1 — Quick Wins (1-2 days)
- [ ] Add rate limiting to registration endpoint (IP-based, 3/hour)
- [ ] Add rate limiting to gift card redemption endpoint
- [ ] Add idempotency protection for reward redemptions
- [ ] Strengthen wallet scan: require JWT token, not just card number format
- [ ] Normalize all phone numbers to E.164 on registration

### Phase 2 — Important (3-5 days)
- [ ] Phone verification on registration (SMS OTP via Twilio, or staff-confirmed)
- [ ] Staff activity report in analytics dashboard
- [ ] Per-card daily topup limit (in addition to per-staff)
- [ ] Business hours configuration + out-of-hours scan warning
- [ ] Increase gift card code entropy to 128 bits

### Phase 3 — Hardening (1-2 weeks)
- [ ] Customer PIN or password for login
- [ ] Device fingerprinting (limit accounts per device)
- [ ] CSRF tokens for state-changing endpoints
- [ ] CSP headers
- [ ] Structured audit log for all sensitive operations
- [ ] Anomaly detection alerts (scan velocity per staff)

### Phase 4 — Nice to Have
- [ ] Geofencing for wallet scans
- [ ] NFC tap support (NTAG 424 DNA)
- [ ] POS integration for purchase-linked visits
- [ ] Dual authorization for high-value redemptions

---

## Industry Context

- 72% of loyalty programs have experienced fraud
- $3.1 billion in loyalty points fraudulently redeemed annually
- Most common attack: account farming + staff collusion
- Industry gold standard: tying loyalty to POS transactions (Starbucks model)
- For small businesses: single-use QR + staff-gated scans + audit trail covers 90% of risk
- Biggest bang for buck: SMS verification on registration + staff monitoring dashboard
