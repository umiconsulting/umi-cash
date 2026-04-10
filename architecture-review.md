# Architecture Review Report — Umi Cash

**Date:** 2026-03-28
**Reviewer:** Architecture Critic (as defined in `architect-software.md`)
**Scope:** Full-stack architecture, security posture, infrastructure, and operational readiness
**Codebase:** ~11,600 LOC across 27 API routes, 27 pages, 16 library modules, 13 data models

---

## 1. Context Analyzed

Umi Cash is a **multi-tenant digital loyalty/rewards platform** for small-to-medium food & beverage businesses in Mexico. It provides:

- Stamp-based loyalty cards with visit tracking and reward cycles
- Prepaid balance (top-up/purchase)
- Apple Wallet & Google Wallet pass integration
- Gift card issuance and redemption
- QR-code-based customer identification
- Tenant-branded white-label experience via slug-based routing

**Stack:** Next.js 14 (App Router) + Prisma + PostgreSQL (Supabase) + Vercel

---

## 2. Summary of Findings

| Severity | Count | Categories |
|----------|-------|------------|
| **CRITICAL** | 3 | Security (RLS, rate limiter, CSP) |
| **HIGH** | 7 | Security, reliability, data integrity |
| **MEDIUM** | 8 | Performance, observability, maintainability |
| **LOW** | 5 | Technical debt, optimization opportunities |

The architecture is well-structured for a pre-launch product with clean separation of concerns, good multi-tenancy isolation at the application layer, and solid authentication design. However, there are **critical security gaps at the infrastructure layer** (Supabase RLS, rate limiting) that must be resolved before production traffic scales.

---

## 3. Good Practices Detected

### Security Strengths
- **Scrypt password hashing** — Memory-hard, GPU-resistant. Legacy SHA256 supported read-only with timing-safe comparison. Excellent.
- **JWT architecture** — Separate secrets for access (15m), refresh (30d), and QR (5m) tokens. Short-lived access tokens minimize breach window.
- **QR token rotation** — Single-use QR tokens with rotation after each scan prevent replay attacks effectively.
- **Timing-safe comparisons** — Used consistently in password verification and token validation (crypto.timingSafeEqual).
- **Tenant isolation** — All queries filter by tenantId. Staff cannot operate across tenants. Staff cannot scan their own cards.
- **Zod validation** — Input validation on all mutation endpoints with proper error handling.
- **Anti-fraud controls** — 24h visit deduplication, 60s wallet scan cooldown, $5,000/day staff top-up limits, 3 top-ups/day per card.

### Architectural Strengths
- **Clean multi-tenancy** — Slug-based routing with TenantContext, CSS variables per tenant, and consistent tenantId filtering.
- **Subscription gating** — 402 Payment Required on suspended tenants. Trial expiry built in.
- **Wallet integration depth** — Both Apple (PKPass with APN push) and Google Wallet (JWT-based) with dynamic strip image generation.
- **Progressive approach to wallet passes** — Two styles ("default" with unicode dots, "stamps" with dynamic image) give tenants flexibility.
- **Transaction-safe mutations** — Scan and top-up use Prisma `$transaction` for atomicity.
- **Comprehensive documentation** — SETUP.md (local dev) and DEPLOYMENT.md (26KB production guide) are thorough.

---

## 4. Bad Practices / Anti-Patterns

### CRITICAL — Must Fix Before Production Scale

#### C1. Row-Level Security (RLS) Disabled on ALL Supabase Tables
**Impact:** CRITICAL | **Effort:** Medium

All 12 tables have `rls_enabled: false` and `rls_forced: false`. Since the app uses Supabase PostgreSQL, the database is accessible via the Supabase REST API (`/rest/v1/`) and the Supabase JS client using the `anon` key. With RLS disabled, **any client with the Supabase URL and anon key can read and write ALL data** — including passwords, sessions, financial transactions, and card balances.

This is the single most critical vulnerability. Even though the app uses server-side Prisma (not the Supabase client library), the Supabase PostgREST API is still exposed by default.

**Recommendation:**
1. Enable RLS on all tables immediately
2. Create restrictive policies that deny all access via the Supabase anon key
3. Grant access only through the `service_role` key (used by Prisma's connection string)
4. Alternatively, revoke PostgREST access entirely if not using Supabase client libraries

#### C2. In-Memory Rate Limiter is Ineffective on Vercel Serverless
**Impact:** CRITICAL | **Effort:** Medium

The rate limiter (`src/lib/rate-limit.ts`) uses a `Map<string, RateLimitEntry>` stored in module-level memory. On Vercel:
- Each function invocation gets a **fresh cold-start environment**
- The `setInterval` for pruning never executes (functions are ephemeral)
- An attacker can bypass rate limits entirely by hitting different function instances

This means authentication brute-force protection, login rate limiting, and registration rate limiting are **completely non-functional in production**.

**Recommendation:**
- Replace with Vercel KV (Redis) or Upstash Redis for distributed rate limiting
- Alternatively, use Vercel's Edge Middleware with their built-in rate limiting primitives
- As a quick interim fix, use Vercel's built-in WAF/DDoS protection at the edge

#### C3. Content Security Policy Allows `unsafe-eval`
**Impact:** HIGH | **Effort:** Low

The CSP header includes `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. While Next.js historically required `unsafe-eval` for development, production builds should use strict CSP with nonces. `unsafe-eval` opens the door to XSS-based code injection.

**Recommendation:**
- Remove `unsafe-eval` in production builds
- Use Next.js 14's built-in CSP nonce support (`next/headers` with `nonce` attribute)
- Keep `unsafe-eval` only in development via environment-conditional configuration

---

### HIGH — Fix Before Significant User Growth

#### H1. No Automated Session Cleanup
**Impact:** HIGH | **Effort:** Low

The Session table contains 35 rows for 9 users (3.9 sessions per user average). Sessions are created on every login but never cleaned up. There is no:
- Cron job to delete expired sessions
- Maximum session limit per user
- Cleanup on logout (only cookie cleared, DB row remains)

Over time this leads to unbounded table growth and potential performance degradation on token lookups.

**Recommendation:**
- Add a Vercel Cron Job (daily) to `DELETE FROM "Session" WHERE "expiresAt" < NOW()`
- Limit sessions per user (e.g., max 5 active; delete oldest on new login)
- Delete the DB session row on logout, not just the cookie

#### H2. No Error Tracking / Observability
**Impact:** HIGH | **Effort:** Low

No Sentry, Datadog, LogRocket, or any error tracking is configured. API failures silently `console.error` and return generic 500s. In production:
- You won't know about failures until users report them
- No stack traces, no error rates, no performance baselines
- Apple Wallet push failures silently log to stdout (lost on Vercel)

**Recommendation:**
- Add Sentry (free tier: 5,000 errors/month) with `@sentry/nextjs`
- Add Vercel Web Analytics + Speed Insights (free, already recommended in CLAUDE.md)
- Add structured logging with request IDs for correlation

#### H3. staffId Not Foreign-Keyed in Visit and Transaction
**Impact:** HIGH | **Effort:** Low

`Visit.staffId` and `Transaction.staffId` are plain text columns with no foreign key to the User table. This means:
- A deleted staff user's ID persists in records with no referential integrity
- Queries joining staff info require manual validation
- A corrupted staffId could be written without database-level protection

**Recommendation:**
- Add FK: `Visit.staffId -> User.id` with `ON DELETE RESTRICT`
- Add FK: `Transaction.staffId -> User.id` with `ON DELETE RESTRICT`
- Migrate existing data to ensure all staffId values are valid

#### H4. RewardRedemption Allows Invalid configId ('default')
**Impact:** HIGH | **Effort:** Low

In `scan/route.ts:100`, the configId is set to `rewardConfig?.id ?? 'default'`. If no active reward config exists, the string `'default'` is written as configId. But `RewardRedemption.configId` has a FK to `RewardConfig.id` — meaning:
- If no RewardConfig exists, the redemption will fail with an FK violation
- The `'default'` fallback is unreachable or will crash

**Recommendation:**
- Ensure a RewardConfig always exists (seed a default on tenant creation)
- Remove the `?? 'default'` fallback; throw a clear error if config is missing
- Add a CHECK constraint or application-level validation

#### H5. CORS Allows Missing Origin Header
**Impact:** MEDIUM-HIGH | **Effort:** Low

The middleware (`src/middleware.ts:21`) allows all requests where `origin` is null. While this is needed for server-to-server calls, it also means:
- Any tool that strips the Origin header (curl, Postman, custom HTTP clients) bypasses CORS
- CSRF attacks from non-browser contexts are not blocked

**Recommendation:**
- For production, require Origin header on all mutation endpoints
- Use a CSRF token for sensitive operations (scan, top-up, purchase)
- Move server-to-server auth to API keys rather than relying on Origin absence

#### H6. Wallet Push Updates Block the Request-Response Cycle
**Impact:** MEDIUM-HIGH | **Effort:** Medium

In scan/route.ts, wallet updates are `await`ed inline:
```typescript
// Line 191: await Promise.all([sendApplePushUpdate(...), updateGoogleWalletObject(...)])
```
The Apple push creates a new HTTP/2 connection to `api.push.apple.com` for each device, with a 10-second timeout. For tenant-wide pushes (`sendApplePushUpdateForTenant`), this is sequential across ALL cards.

This adds 200-2000ms latency to the scan response for staff. The comment notes `waitUntil + http2 is unreliable on Vercel` — but the current approach trades reliability for latency.

**Recommendation:**
- Use a queue (Vercel Queues, Inngest, or Upstash QStash) for push notifications
- Fire-and-forget the queue enqueue, process pushes asynchronously
- Batch device pushes using HTTP/2 connection multiplexing (single connection per push burst)

#### H7. No Test Suite
**Impact:** HIGH | **Effort:** High

Zero test files exist in the codebase. The reward cycle logic (visit counting, cycle reset, pending rewards), transaction limits, QR token rotation, and multi-tenant isolation are all complex business rules that are regression-prone.

**Recommendation:**
- Priority 1: Unit tests for `auth.ts` (password hashing, JWT signing/verification)
- Priority 2: Integration tests for scan flow (visit, reward earned, redeem)
- Priority 3: Integration tests for top-up (limits, anti-fraud)
- Priority 4: Multi-tenant isolation tests
- Use Vitest (fast, Next.js compatible) with Prisma's built-in test helpers

---

### MEDIUM — Address for Production Hardening

#### M1. Apple Wallet Passes Lack Location Triggers
**Impact:** MEDIUM | **Effort:** Low

Apple Wallet passes support up to 10 geo-locations that surface the pass on the lock screen when the user is nearby. The Location table exists with address data but is not used in pass generation. This is one of the highest-engagement features of Apple Wallet passes — the lock-screen notification when a customer walks past the restaurant.

#### M2. `sharingProhibited` Not Set on Apple Passes
**Impact:** MEDIUM | **Effort:** Low

The generated PKPass does not set `sharingProhibited: true`. This means loyalty cards can be AirDropped between users, potentially allowing reward fraud (sharing a card near reward completion).

#### M3. Google Wallet Has Zero Adoption
**Impact:** MEDIUM | **Effort:** Investigation

Database shows 0 cards with `googlePassObjectId` set vs. 3 with `applePassSerial`. The Google Wallet integration code exists but may have configuration/deployment issues, or the UX path to Google Wallet may be broken/hidden. Given Android's market share in Mexico (~75%), this represents a large missed audience.

#### M4. No Database-Level Domain Constraints
**Impact:** MEDIUM | **Effort:** Medium

There are no CHECK constraints beyond NOT NULL. Missing validations:
- `balanceCentavos >= 0` (prevents negative balances via race conditions)
- `totalVisits >= 0`, `visitsThisCycle >= 0`, `pendingRewards >= 0`
- `role IN ('CUSTOMER', 'STAFF', 'ADMIN')`
- `subscriptionStatus IN ('ACTIVE', 'SUSPENDED', 'TRIAL')`
- `type IN ('TOPUP', 'PURCHASE', 'ADJUSTMENT')` for Transaction
- `amountCentavos > 0` for GiftCard

#### M5. No Enumerated Types
**Impact:** MEDIUM | **Effort:** Medium

Role, transaction type, subscription status, and pass style are all stored as plain text. PostgreSQL ENUMs would provide compile-time and runtime type safety. Combined with M4, this means invalid values can be written to the database.

#### M6. Inconsistent FK ON DELETE Strategy
**Impact:** MEDIUM | **Effort:** Low

| Relationship | ON DELETE | Issue |
|---|---|---|
| LoyaltyCard -> User | CASCADE | Deleting user deletes card + all history |
| Visit -> LoyaltyCard | RESTRICT | Can't delete card if visits exist |
| Transaction -> LoyaltyCard | RESTRICT | Can't delete card if transactions exist |
| GiftCard -> Tenant | CASCADE | Deleting tenant deletes gift cards |
| LoyaltyCard -> Tenant | RESTRICT | Can't delete tenant if cards exist |

The mix of CASCADE and RESTRICT is inconsistent. Deleting a User cascades to LoyaltyCard, but LoyaltyCard is RESTRICT from Visit/Transaction — creating a cascade-then-fail scenario. A user deletion would fail because the card has visits.

**Recommendation:** Use RESTRICT everywhere (financial data should never cascade-delete) or implement soft-delete.

#### M7. Visit Has No Location Reference
**Impact:** MEDIUM | **Effort:** Low

The `Location` table exists (3 rows) but `Visit` has no `locationId` FK. This means:
- Cannot track which branch a visit occurred at
- Cannot generate per-location analytics
- The Location table is effectively orphaned

#### M8. QR Code Regenerated on Every Card Access
**Impact:** MEDIUM | **Effort:** Low

The QR code endpoint generates a new QR image on every request. Since the QR token has a 5-minute validity, the image could be cached for up to 4 minutes, reducing CPU and response time on repeated requests.

---

### LOW — Technical Debt / Optimization

| ID | Finding | Impact |
|----|---------|--------|
| L1 | `swr` package imported in package.json but not used in code | Dead dependency |
| L2 | `waitUntil` imported in scan and topup routes but not used | Dead import (comment explains why) |
| L3 | No pagination in gift card list API | Unbounded query at scale |
| L4 | No bulk customer import/export | Admin usability gap |
| L5 | `passkit-generator` cast to `any` in pass generation | Type safety lost |

---

## 5. Risks and Impact Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data breach via Supabase PostgREST (RLS off) | HIGH | CRITICAL | Enable RLS immediately |
| Brute-force auth attack (rate limiter broken) | HIGH | HIGH | Migrate to Redis-based rate limiter |
| Financial manipulation (no DB-level balance constraints) | LOW | HIGH | Add CHECK constraints |
| Wallet push latency degrading staff UX | MEDIUM | MEDIUM | Move to async queue |
| Regression bugs in reward logic (no tests) | HIGH | MEDIUM | Add test suite |
| Production blind spot (no error tracking) | HIGH | MEDIUM | Add Sentry |
| Google Wallet non-functional (0 adoption) | MEDIUM | MEDIUM | Investigate and fix |

---

## 6. Recommendations (Prioritized)

### Immediate (before production traffic)
1. **Enable RLS on all Supabase tables** — Deny anon/public access, allow service_role only
2. **Replace in-memory rate limiter** with Upstash Redis or Vercel KV
3. **Add Sentry error tracking** with `@sentry/nextjs`
4. **Add session cleanup cron job** (Vercel Cron, daily)

### Short-term (within 2 weeks)
5. Add CHECK constraints for domain validation (balances, roles, types)
6. Add FK constraints for staffId on Visit and Transaction
7. Set `sharingProhibited: true` on Apple passes
8. Add location coordinates to Apple Wallet passes
9. Fix/verify Google Wallet integration path
10. Remove `unsafe-eval` from CSP in production

### Medium-term (within 1 month)
11. Add unit and integration test suite (Vitest)
12. Move wallet push notifications to async queue
13. Add CSRF tokens for mutation endpoints
14. Add audit logging for admin actions
15. Add locationId to Visit table

### Long-term (within quarter)
16. Implement soft-delete across financial entities
17. Add bulk import/export for customer data
18. Add performance monitoring dashboards
19. Consider PgBouncer connection pooling if connection count grows

---

## 7. TSD Compliance Assessment

| Section | Assessment | Status |
|---------|------------|--------|
| Data model | Well-designed with minor integrity gaps (M4, M6, M7) | PARTIAL |
| Security | Strong at app layer; critical gaps at infra layer (C1, C2) | NEEDS WORK |
| Front-end | Appropriate stack (Next.js 14, Tailwind, App Router) | GOOD |
| Back-end | Clean architecture, good separation of concerns | GOOD |
| Observability | No error tracking, no monitoring | NOT PRESENT |
| Scalability | Rate limiter broken on serverless; push notifications sequential | NEEDS WORK |
| Documentation | Excellent setup/deployment docs | GOOD |
| Testing | No tests | NOT PRESENT |

---

## 8. Follow-Ups

- [ ] Review after RLS is enabled — verify PostgREST is properly locked down
- [ ] Review after rate limiter migration — verify distributed limits work
- [ ] Review after test suite is added — assess coverage of critical paths
- [ ] Re-assess Google Wallet adoption after fix — track Android pass creation rate
- [ ] Review push notification architecture after queue migration — measure latency improvement
