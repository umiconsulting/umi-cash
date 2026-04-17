# Umi Cash — Enhancement Findings

Analysis date: 2026-04-16
Scope: full `src/` tree (≈87 TS files), Prisma schema, Next/Vercel config, deployment shape.

No code has been modified. Each finding lists **severity** (🔴 high / 🟡 medium / 🟢 low) and a concrete fix.

---

## 1. 🔴 In-memory rate limiter is ineffective on Vercel Fluid Compute

**Where:** `src/lib/rate-limit.ts`

**Problem.** `rate-limit.ts` uses a process-local `Map` and a `setInterval` to prune it. On Vercel Fluid Compute, function instances are reused across concurrent requests but *not* shared across regions or between cold-started instances. An attacker hitting the login, OTP, gift-redeem, or register endpoints will often land on a fresh instance where their counter is zero. The "lockout" at `login-account:` and `otp-send-phone:` can be bypassed by request volume.

Also, `setInterval` at module scope keeps a timer alive on a short-lived Function; harmless but dead code.

**Fix.**
- Install Upstash Redis via `vercel integration add` (Marketplace — fits `CLAUDE.md` guidance).
- Replace the in-memory Map with Upstash's `@upstash/ratelimit` (sliding-window, built for serverless).
- Keep `rateLimit(key, max, windowMs)` signature so callers (`send-otp`, `verify-otp`, `login`, `customers`, `gift/[code]`, `export`) stay unchanged.
- Remove the `setInterval` (Redis handles TTLs).
- Alternative for tiny scale: Vercel Runtime Cache (`@vercel/functions/unstable_cache` + `updateTag`) — regional, but fine for login lockout.

---

## 2. 🔴 `http2.connect` for APN on every scan — sequential, slow, and leaky

**Where:** `src/lib/push-apple.ts`

**Problem.**
1. `sendPush` opens a **fresh HTTP/2 session** per device and closes it. On Vercel a loop of `for (const reg of registrations)` with `await sendPush` means N RTTs per scan. A customer with 2 devices pays ~400 ms of APN latency *blocking the scan response*.
2. `sendApplePushUpdateForTenant` is O(cards), each card awaits its own loop. A tenant with 500 cards → 500 serialized HTTP/2 sessions inside a PATCH request — will time out at `maxDuration`.
3. Error path `resolve(false)` never short-circuits; code returns `true` on `client.close` even if the push 5xx'd (the status check only logs).
4. Fluid Compute keeps the function warm — the cached `cachedToken` and connection **should** be reused, but connections aren't cached at all.

**Fix.**
- Cache the HTTP/2 session with `http2.connect(APN_HOST, { ... })` at module scope; reuse across invocations until `goaway`/error. This is the Fluid Compute pattern.
- Parallelise device pushes per card (`Promise.all`) — APN supports pipelined streams.
- For tenant-wide fanout (`sendApplePushUpdateForTenant`), push the work to `Vercel Queues` (beta) or a Cron Job — don't fanout inside an interactive PATCH.
- Correctly resolve `false` on non-200 status so the caller can decide.

---

## 3. 🔴 `waitUntil` imported but never used — post-response work happens in the request

**Where:** all six of `scan/route.ts`, `topup/route.ts`, `purchase/route.ts`, `settings/route.ts`, `reward-config/route.ts`, `gift/[code]/route.ts`.

**Problem.** Every one of these has `import { waitUntil } from '@vercel/functions'` and then `await Promise.all([sendApplePushUpdate, updateGoogleWalletObject])` *before* returning. The barista is waiting on Apple+Google round-trips to confirm a scan. Scan latency is user-visible.

Comments claim `waitUntil + http2 is unreliable on Vercel` — that was true before Fluid Compute. The Fluid model explicitly supports `waitUntil`, and `@vercel/functions` is already a dependency.

**Fix.**
- Use `waitUntil(triggerWalletUpdates(...))` so the HTTP response returns immediately.
- If the http2 session is made process-resident (Fix #2), pushes will complete reliably.
- Keep inline-await only for the *admin-facing* redemption where seeing the pass state flip matters (debatable — users don't see the pass in the same session).
- Remove dead `waitUntil` imports from files that choose to keep awaiting.

---

## 4. 🟡 N+1 query fan-outs in analytics and customer list

**Where:** `src/app/api/[slug]/admin/analytics/route.ts`, `src/app/api/[slug]/admin/customers/route.ts`.

**Problems.**
- `analytics/route.ts` fires a big `Promise.all` with 11 queries, then issues a **12th** query (`allVisitsSums`) outside it for `trueAvg` — this duplicates what `totalVisitsAgg` already computed (both aggregate `_sum: totalVisits` over the same `where`). One of them can go.
- `analytics` loads `recentVisits` (up to ~30 days of rows) and `recentUsers` (last 8 weeks) purely to count them per day/week. Rewrite as `GROUP BY date_trunc('day', ...)` via `prisma.$queryRaw` — the buckets are tiny but the row scan isn't.
- `customers/route.ts` sort `'ltv'` and `'inactive'` fetch **every** customer, every transaction, then sort in JS and slice. For a tenant with 10k customers + purchases this returns MBs per request. Push the sort into SQL: add a `ltvCentavos` denormalised field updated inside the purchase transaction, OR use a materialised view, OR fallback to `$queryRaw` with a window function.

**Fix.**
- Drop duplicate aggregate in `analytics/route.ts` line 192-195.
- Replace `recentVisits.findMany(select scannedAt)` with a raw `GROUP BY date(scannedAt)` query.
- Add `ltvCentavos` column to `LoyaltyCard` (backfill migration), increment it in the `purchase` transaction, then sort via `orderBy: { card: { ltvCentavos: 'desc' } }` without loading everything.

---

## 5. 🟡 Non-atomic pending-reward check, and out-of-tx pre-read in purchase

**Where:** `src/app/api/[slug]/admin/scan/route.ts`, `src/app/api/[slug]/admin/purchase/route.ts`.

**Problem.**
- In `scan` REDEEM branch the pending-rewards check `if (card.pendingRewards <= 0)` is done on the **pre-transaction** `card` read. The `$transaction` body does not re-verify. A second concurrent REDEEM can decrement below zero.
- The 30-second "recent redemption" check is good, but inside a tx `findFirst` doesn't take a row-level lock; two redemptions at 31s apart still race.
- `purchase/route.ts` does the same: balance check is done inside `$transaction` (good) — but `card.userId === staff.sub` guard is checked outside on stale data. Fine today; note for future.

**Fix.**
- Move the `pendingRewards <= 0` check *inside* the `$transaction`, using the `tx.loyaltyCard.findUniqueOrThrow` pattern from `purchase`.
- For stronger guarantees, do an explicit atomic conditional update: `UPDATE ... SET pending_rewards = pending_rewards - 1 WHERE id = ? AND pending_rewards > 0 RETURNING *` via `$queryRaw` — then `if (result.rowCount === 0) throw`.

---

## 6. 🟡 `scan` after-hours block calls Date math twice; tenant timezone logic is fragile

**Where:** `src/app/api/[slug]/admin/scan/route.ts`, lines 77-115.

**Problem.** The code computes "start of day in tenant TZ" by:
```
const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
const offsetMs = utcNow.getTime() - localNow.getTime();
const startOfDayUTC = new Date(startOfDay.getTime() + offsetMs);
```
That indirect offset trick fails around DST transitions (wrong direction for a 1-hour window) and for tenants in half-hour offsets. You already depend on `date-fns-tz` — use it.

**Fix.** Replace with:
```ts
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
const nowInTz = toZonedTime(new Date(), tz);
const startOfTodayInTz = startOfDay(nowInTz);
const startOfDayUTC = fromZonedTime(startOfTodayInTz, tz);
```

---

## 7. 🟡 Stale Next.js + React major versions

**Where:** `package.json`.

- `next: ^14.2.35` — current stable is Next 15.x with React 19. App Router defaults (async params), better error boundaries, Turbopack dev stable, Partial Prerendering / Cache Components.
- `@prisma/client: ^5.17.0` — Prisma 6 is GA; 6 has much faster cold starts on serverless (the main Vercel pain with Prisma).
- `jsonwebtoken` + `jose` — two JWT libs. `jose` is used everywhere except `@types/jsonwebtoken` which is unused (grep shows no `jsonwebtoken` imports). Remove.

**Fix.**
- Use `/vercel:next-upgrade` to run Next 15 codemod; watch for the async-params change (route handlers take `params: Promise<...>`).
- Upgrade Prisma to 6 — cold-start gains are real.
- `npm rm jsonwebtoken @types/jsonwebtoken`.

---

## 8. 🟡 `next.config.mjs` CSP is weak; Permissions-Policy blocks camera in cross-origin iframes only

**Where:** `next.config.mjs`.

**Problems.**
- CSP allows `'unsafe-inline' 'unsafe-eval'` in `script-src`. Next 14 supports nonce-based inline via middleware — ship it to reach a real CSP.
- `connect-src 'self'` blocks calls to Resend, Google Wallet, APN. It works today because those calls are server-side, but any future client-side fetch to a third-party will fail silently.
- `X-XSS-Protection` is deprecated and should be removed.
- Missing: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-site`.
- `experimental.serverComponentsExternalPackages` renames to `serverExternalPackages` in Next 15.

**Fix.** Ship nonce-based CSP via middleware; drop XSS-Protection; add COOP/CORP; move `passkit-generator` and `apn` to `serverExternalPackages`.

---

## 9. 🟡 Middleware CORS check accepts requests with no Origin

**Where:** `src/middleware.ts`, lines 20-21.

**Problem.** CSRF protection bypasses any mutating request that doesn't send an `Origin` header. Fetch from a browser always sends it, but a malicious page using `<form action=POST>` can omit it in certain CORS modes. Combined with cookie-based auth (refresh cookie on `/[slug]`), this is the classic login-CSRF setup.

Current login uses Bearer tokens in the body response, so only the **refresh** endpoint is cookie-authenticated (path `/${slug}`, SameSite strict). `strict` cookies prevent cross-site sends, so the attack surface is small. But the middleware comment says "Allow requests with no Origin (server-to-server, Postman in dev)" — that is exactly the hole.

**Fix.**
- Require `Origin` on mutating methods in production (`VERCEL_ENV === 'production'`).
- Allow missing `Origin` only when `Authorization: Bearer` is present (API clients always send the token).
- Alternatively, add a double-submit CSRF token for cookie-authenticated routes.

---

## 10. 🟡 OTP verification can be replayed across tenants / stale sessions

**Where:** `src/app/api/[slug]/auth/verify-otp/route.ts` + `customers/route.ts` consumers.

**Observations** (need to re-read `verify-otp/route.ts` to be sure — not shown above).
- `OtpVerification` is indexed on `[phone, tenantId]`, good.
- The verification JWT in `customers/route.ts` uses `JWT_ACCESS_SECRET` as its secret — re-using the same key for a *purpose-specific* token. If the verification token ever leaks, it also matches access-token validation in `jwtVerify` (same secret, same HS256). `verifyAccessToken` doesn't check a `purpose` claim.

**Fix.**
- Use a separate secret `JWT_VERIFICATION_SECRET`, or mint the token with a distinct `aud`/`iss` and validate in `verifyAccessToken` that `payload.purpose !== 'phone-verification'`.
- OR: store verification in DB (`OtpVerification.verifiedAt`) instead of a JWT round-trip.

---

## 11. 🟡 Register endpoint leaks session to collision requester

**Where:** `src/app/api/[slug]/customers/route.ts`, lines 68-77.

**Problem.** When the phone is already registered, the endpoint returns `409` **with an `accessToken` for the existing user**. Any attacker who discovers a valid-looking phone number + OTP (via SIM-swap, reused OTP, or a leak) receives a full session. The OTP verification token above is scoped to `phone + tenant`, so the attacker must pass SMS — but the design still trades off "UX convenience for existing users" against account takeover. Treat an already-registered phone as an OTP-authenticated *login*, not an implicit new-session mint.

**Fix.**
- On 409, return a minimal `{ error, alreadyRegistered: true }` and require an explicit "log in" flow that issues the session — still OTP-gated, but makes the intent explicit.
- Alternatively, convert to a unified `/login-or-register` endpoint documented as such.

---

## 12. 🟢 `Apple Pass` generation does sync filesystem reads per request

**Where:** `src/lib/pass-apple.ts`, lines 169-192.

**Problem.** For every pass generated we `fs.readFileSync` tenant-specific icon files (up to 3 sizes × failed-read-per-slug). On Vercel Functions this is a disk hit per scan. Low volume today; adds up for analytics updates and cron push bursts.

**Fix.** Module-scope LRU cache keyed on `${tenantSlug}-${file}` → Buffer, populated lazily with `fs.readFile` (async). Same for WWDR + signer cert — already cached, but worth a comment so no-one reintroduces sync reads.

---

## 13. 🟢 `sharp` imported dynamically per pass generation

**Where:** `src/lib/pass-apple.ts` line 145: `const { default: sharp } = await import('sharp')`.

**Problem.** Deferring the `sharp` import was probably to avoid a cold-start cost, but `sharp` is listed in `dependencies` and loaded on every request now. You pay the dynamic-import overhead without the deferral benefit because a pass generator always needs `sharp`.

**Fix.** Top-level `import sharp from 'sharp'`. Measure cold start — likely a wash.

---

## 14. 🟢 `opportunistic` session cleanup races with itself

**Where:** `src/lib/auth.ts`, lines 66-82.

**Problem.** `maybeCleanExpiredSessions` fires on every request, gated by `lastSessionCleanup` module var. In Fluid Compute, N concurrent requests on the same warm instance each see `now - lastSessionCleanup < 10min` as false and issue the `deleteMany`. N delete-many storms.

Not a correctness bug (idempotent), but wasteful. You already have the cron `api/cron/cleanup-sessions` at 4am — **remove this entirely**.

**Fix.** Delete `maybeCleanExpiredSessions` and its call in `getAuthUser`. Keep the cron.

---

## 15. 🟢 Two near-identical Apple pass routes

**Where:** `src/app/api/[slug]/passes/apple/[serial]/route.ts` vs the `handleGetPass` branch of `[...path]/route.ts`.

**Observation.** Both paths: (1) auth via `ApplePass <token>`, (2) fetch card, (3) generate pass, (4) return `pkpass`. The v1 catch-all handles `/v1/passes/{passTypeId}/{serial}` (Apple Web Service). The `[serial]` route handles an undocumented path — I can't find what calls it in the front-end.

**Fix.** Either remove the standalone `[serial]` route if nothing calls it, or extract a `generatePassResponse(card, tenant, slug)` helper used by both. DRY the ~40 duplicated lines.

---

## 16. 🟢 `tsconfig.tsbuildinfo` and local env files are tracked as untracked git state

**Where:** repo root.

**Observation.** `git status` shows `tsconfig.tsbuildinfo`, `.env.prod.tmp`, `.env.vercel` untracked — these should be `.gitignore`'d. `tsconfig.tsbuildinfo` is a build artefact; `.env*.tmp` and `.env.vercel` may contain secrets.

**Fix.** Add to `.gitignore`:
```
*.tsbuildinfo
.env.*.tmp
.env.vercel
```
Audit the already-tracked `tsconfig.tsbuildinfo` and remove with `git rm --cached`.

---

## 17. 🟢 Analytics route ignores timezone for day buckets

**Where:** `analytics/route.ts` line 132-133: `v.scannedAt.toISOString().slice(0, 10)`.

**Problem.** Uses UTC midnight, not tenant TZ. A Culiacán store (UTC-7) gets visits before 7am local shown on the previous day. Same bug exists in `newCustomersByWeek`.

**Fix.** `Intl.DateTimeFormat('en-CA', { timeZone: tenant.timezone }).format(v.scannedAt)` for YYYY-MM-DD in tenant TZ.

---

## 18. 🟢 SMS OTP body is not tenant-branded and gives no app name

**Where:** `src/app/api/[slug]/auth/send-otp/route.ts` line 60.

**Observation.** `"Tu código de verificación es: 123456. Válido por 5 minutos."` has no brand — carriers' anti-phishing heuristics down-rank it, and users get a bare message they may ignore. Adding `${tenant.name}` costs nothing.

Also: Twilio Verify (Messaging Service + Verify API) handles OTP flow end-to-end and is cheaper than raw Programmable Messaging for OTP.

---

## 19. 🟢 `vercel.json` should migrate to `vercel.ts`

**Where:** `vercel.json`.

**Observation.** Only 12 lines today but the Vercel knowledge update notes `vercel.ts` is the recommended form. Benefits: typed cron schedules, dynamic `deploymentEnv` gating, header rules in code. Non-urgent.

---

## 20. 🟢 `experimental.outputFileTracingIncludes` glob still pulls `.p8` APN key if present

**Where:** `next.config.mjs`, `outputFileTracingIncludes: { '/api/*/passes/apple': ['./passes/apple/**/*'] }`.

**Observation.** `**/*` pulls certificates *and* the APN `.p8` if it exists on the filesystem. Certificates are already in env vars in production (good), but the glob is wider than needed. Narrow it to `./passes/apple/template.pass/**/*` so filesystem-fallback doesn't ship secrets to the bundle.

---

## Summary — priority order

1. **#1 rate limiter** — correctness + security (user-visible attack).
2. **#3 waitUntil not used** — free performance win across six hot paths.
3. **#2 APN connection pooling** — scan latency + tenant-broadcast correctness.
4. **#4 analytics/customers N+1** — scales badly past a few tenants.
5. **#5 pending-reward race** — rare, but a money-adjacent correctness bug.
6. **#6 timezone math** — DST lurking.
7. **#10/#11 OTP scope & session mint** — defense-in-depth on the auth surface.
8. Everything else — clean-up / minor wins.

None of these are shipped-the-bed emergencies. #1, #3, and #5 are the ones I'd fix first.
