# Gap Analysis — Umi Cash

**Date:** 2026-03-28
**Perspective:** Architecture Critic + Product Owner (informed by Apple documentation, industry research, and competitor analysis)
**Method:** Comparison of current implementation against Apple Wallet official requirements, loyalty program industry best practices, and top-performing competitor programs (Starbucks, McDonald's, Chick-fil-A, Panera, Dunkin', Square Loyalty, Fivestars/SumUp)

---

## 1. Apple Wallet Compliance Gaps

### 1.1 Missing Location-Based Lock Screen Triggers (HIGH)

**Apple provides:** Up to 10 geo-locations per pass + iBeacon support. When a customer is near a specified location, the pass surfaces on the lock screen with a custom message.

**Current state:** The `Location` table has 3 rows with addresses, but the generated PKPass includes **no `locations` array and no `maxDistance` field**. The Location data is not used in `pass-apple.ts`.

**Industry context:** Location-based triggers are one of the highest-engagement features of Apple Wallet. Starbucks and McDonald's use this aggressively — the card surfaces when the customer walks past the restaurant, creating a subconscious prompt to visit.

**Gap impact:** Missing the single most powerful passive engagement feature that Apple Wallet offers. For restaurants, this is a "free marketing" channel that requires zero effort after setup.

**Recommendation:** Add `locations` and `relevantText` to the PKPass. Pull coordinates from Location table (requires geocoding addresses or adding lat/lng columns).

### 1.2 `sharingProhibited` Not Set (MEDIUM)

**Apple provides:** `sharingProhibited: true` prevents AirDrop sharing of passes.

**Current state:** Not set in `pass-apple.ts`. Users can share their loyalty card via AirDrop.

**Gap impact:** A customer close to earning a reward could share the card to another person's phone, allowing reward fraud or duplicate scans.

### 1.3 No `expirationDate` or `voided` Usage (LOW)

**Apple provides:** `expirationDate` for passes that should expire, `voided` to mark a pass as void.

**Current state:** Neither is used. Passes live forever. If a tenant's subscription is suspended, the pass remains on the customer's phone and appears valid.

**Gap impact:** Low for now, but as tenant churn occurs, orphaned passes on customer phones create confusion. A voided pass shows a visual "EXPIRED" overlay in Apple Wallet.

### 1.4 No `relevantDate` for Time-Based Engagement (LOW)

**Apple provides:** `relevantDate` surfaces the pass at a specific time (e.g., lunch hour).

**Current state:** Not used. Passes are static in terms of time relevance.

**Gap impact:** Missed opportunity for time-triggered reminders (e.g., "Your loyalty card — lunchtime at El Gran Ribera").

### 1.5 No Error Log Endpoint (LOW)

**Apple requires:** `POST /v1/log` endpoint for receiving error logs from devices.

**Current state:** Not verified (would need to check the passkit-generator web service implementation).

---

## 2. Product Gaps vs. Industry Best Practices

### 2.1 First Reward Too Distant — Default 10 Visits (HIGH)

**Research finding:** Programs where the first reward is achievable within **3-5 visits** see significantly higher retention. The top cause of loyalty program abandonment (54% of abandoners) is "takes too long to earn rewards." The "goal gradient" effect shows visit frequency increases ~50% when customers are within 1-2 visits of a reward.

**Current state:** Default `visitsRequired: 10`. Configurable per tenant, but the default and both seeded tenants use 10.

**Gap impact:** At 1 visit per day maximum (24h cooldown), a new customer needs 10 separate days to earn their first reward. This is at the outer edge of what research supports. The first reward should feel attainable within the first 1-2 weeks.

**Recommendation:**
- Change default to 8 visits (still within research's 8-10 "sweet spot" range)
- Document for tenants that 5-8 visits is optimal for retention
- Consider tenant onboarding guidance suggesting 5 for cafes, 8-10 for restaurants

### 2.2 No Endowed Progress Effect (HIGH)

**Research finding:** Starting a card with 1-2 stamps already filled increases completion rates by **78%** (Nunes & Dreze, Columbia/UCLA). A "12-stamp card with 2 pre-filled" outperforms a "10-stamp card starting at 0" even though both require 10 visits.

**Current state:** New customers start at `visitsThisCycle: 0, totalVisits: 0`. No initial stamp on registration.

**Gap impact:** Missing a scientifically proven technique for increasing reward completion rates. This is one of the highest-ROI changes possible — zero ongoing cost, major retention impact.

**Recommendation:** Award 1 stamp upon registration. Adjust `visitsThisCycle` to 1 and `totalVisits` to 1 at card creation time.

### 2.3 No Goal-Proximity Push Notifications (HIGH)

**Research finding:** Push notifications and reminders drive 20-30% of all redemptions. Customers near their reward threshold should receive a nudge. Visit frequency increases ~50% when within 1-2 stamps of a reward.

**Current state:** The app sends a `changeMessage` notification when the Apple Wallet pass updates (on visit or balance change). But there is **no proactive notification** when a customer is close to a reward but hasn't visited recently. No "You're 2 visits away from a free coffee!" reminder.

**Gap impact:** Missing the highest-leverage engagement moment in the loyalty lifecycle.

**Recommendation:** Add a scheduled notification (Vercel Cron + email/WhatsApp) for customers who are within 2 visits of a reward and haven't visited in 3+ days.

### 2.4 Reverse QR Flow vs. SMB Best Practice (MEDIUM — Acceptable Tradeoff)

**Research finding:** For SMBs, the "business displays QR, customer scans" model is preferred — no POS integration, no staff training burden. However, the "customer displays QR, business scans" model (used by Starbucks) is more fraud-resistant.

**Current state:** Umi Cash uses the **customer-displays, staff-scans** model. The customer shows their QR code (from the app or wallet pass), and the staff member scans it using the admin scan page.

**Assessment:** This is actually the **more secure** approach and is appropriate given that Umi Cash handles financial balances (top-ups, purchases). The tradeoff is slightly more friction (staff needs to open scanner) but much better fraud prevention. **This is acceptable.**

### 2.5 No Referral / Gifting of Rewards (MEDIUM)

**Research finding:** Chick-fil-A's ability to gift rewards to friends/family drives viral adoption. Treat-based redemption creates a word-of-mouth loop.

**Current state:** Gift cards exist (send monetary balance), but there's no way to:
- Gift a pending reward to another customer
- Share a "free visit" with a friend
- Earn bonus stamps for referring new customers

**Gap impact:** Missing a proven viral acquisition channel.

### 2.6 No Surprise-and-Delight Random Rewards (MEDIUM)

**Research finding:** Chick-fil-A and Panera use random/surprise rewards to create excitement (variable reward psychology). Panera's original program was built entirely around surprise rewards rather than predictable stamps.

**Current state:** Rewards are purely deterministic — reach N visits, earn reward. No mechanism for tenant-admins to push a surprise reward to a specific customer or segment.

**Gap impact:** Lower emotional engagement. Predictable programs are functional but don't create the "delight" moments that drive word-of-mouth.

### 2.7 Google Wallet Adoption at Zero (HIGH for Mexico Market)

**Research finding:** Android market share in Mexico is approximately **75%**. Only ~25% of the market uses iOS.

**Current state:** 0 out of 5 loyalty cards have `googlePassObjectId` set. The Google Wallet integration code exists but appears to have zero real-world usage.

**Gap impact:** If the Google Wallet path is broken or the UX to add to Google Wallet is insufficient, **75% of the addressable market** cannot use the wallet pass feature. This could be the single largest product gap in terms of market reach.

**Recommendation:** Urgently investigate why Google Wallet adoption is zero — is it a configuration issue, UX visibility issue, or broken code?

### 2.8 No Offline Fallback (MEDIUM)

**Research finding:** ~15% of customers report QR scanning issues (lighting, camera, slow loading). Restaurant environments often have poor connectivity. Having a manual fallback (enter phone number) is essential.

**Current state:** The staff scan page requires camera access and QR code scanning. There's a `findCardByIdentifier` helper that supports card number lookup, but the scan UI doesn't appear to have an explicit "manual entry" fallback for when scanning fails.

**Gap impact:** 10-15% of scan attempts could fail in challenging environments (low light, cracked screens, poor connectivity).

### 2.9 No Analytics on Key Loyalty Metrics (MEDIUM)

**Research finding:** Essential metrics to track include enrollment rate, active rate (30/60/90 day), time to first reward, redemption rate, and viral coefficient.

**Current state:** The admin analytics page shows visit trends and LTV. But key loyalty-specific metrics are missing:
- **Enrollment rate** (signups / total customers visiting)
- **Active rate** (customers with visit in last 30 days / total customers)
- **Time to first reward** (days from enrollment to first reward earned)
- **Redemption rate** (rewards redeemed / rewards earned)
- **Cycle completion rate** (cards that complete a full cycle / cards that start one)
- **Churn rate** (customers with no visit in 60+ days)

### 2.10 No Subscription / Paid Tier Model for Customers (LOW — Future)

**Research finding:** Panera's Unlimited Sip Club ($12-15/month) drove visit frequency up 3-5x. Subscription models layered on loyalty are the highest-LTV mechanism in food/beverage.

**Current state:** No customer subscription capability. Tenants have subscriptions (Umi SaaS model), but end customers don't.

**Assessment:** This is a future opportunity, not a current gap. The current stamp-and-balance model is correct for launch.

---

## 3. Missing Components

| Component | Category | Priority | Rationale |
|-----------|----------|----------|-----------|
| Supabase RLS policies | Security | **P0** | Data breach risk |
| Distributed rate limiter | Security | **P0** | Auth brute-force unprotected |
| Error tracking (Sentry) | Observability | **P1** | Blind to production failures |
| Session cleanup cron | Operations | **P1** | Unbounded table growth |
| DB CHECK constraints | Data integrity | **P1** | Invalid state prevention |
| Location triggers in Apple Pass | Product / Engagement | **P1** | Highest-impact engagement feature |
| Google Wallet fix/verification | Product / Reach | **P1** | 75% of Mexico market is Android |
| Goal-proximity notifications | Product / Retention | **P2** | Drives 20-30% of redemptions |
| Endowed progress on registration | Product / Retention | **P2** | 78% increase in completion rate |
| Unit/integration test suite | Quality | **P2** | Regression prevention |
| Manual scan fallback (phone entry) | Product / Reliability | **P2** | 10-15% scan failure mitigation |
| Loyalty-specific analytics dashboard | Product / Insights | **P2** | Tenant decision-making data |
| Audit logging for admin actions | Security / Compliance | **P3** | Accountability trail |
| Surprise/random reward mechanism | Product / Engagement | **P3** | Emotional engagement driver |
| Referral rewards | Product / Growth | **P3** | Viral acquisition loop |

---

## 4. Misalignments with Best Practices

### Architecture Misalignments

| Area | Best Practice | Current State | Severity |
|------|--------------|---------------|----------|
| Rate limiting | Distributed (Redis) for serverless | In-memory Map (per-invocation) | CRITICAL |
| Database security | RLS on all tables in Supabase | RLS disabled everywhere | CRITICAL |
| CSP | No `unsafe-eval` in production | `unsafe-eval` enabled | HIGH |
| Push notifications | Async/queued delivery | Synchronous inline await | MEDIUM |
| Session management | Bounded lifetime, cleanup cron | Unbounded growth | MEDIUM |
| FK integrity | All references FK-constrained | staffId columns unlinked | MEDIUM |
| Monitoring | Error tracking + APM | Console.error only | HIGH |

### Product Misalignments

| Area | Industry Best Practice | Current State | Severity |
|------|----------------------|---------------|----------|
| First reward attainability | 3-5 visits | 10 visits (default) | HIGH |
| Endowed progress | Start with 1-2 stamps | Start at 0 | HIGH |
| Mobile wallet coverage | Both iOS + Android | iOS functional, Android at 0% | HIGH |
| Location-based engagement | Geo-triggers on wallet passes | Not implemented | HIGH |
| Goal-proximity nudges | Notify when close to reward | Not implemented | MEDIUM |
| QR scan fallback | Manual phone/card number entry | QR-only (staff side) | MEDIUM |
| Loyalty analytics | Track enrollment, active, churn rates | Basic visit/LTV only | MEDIUM |
| Data collection at signup | Phone or email only (minimal) | Phone + name (acceptable) | LOW |

---

## 5. Prioritized Action Plan

### Phase 1: Security & Stability (Week 1)
1. Enable Supabase RLS on all tables
2. Replace rate limiter with Upstash Redis
3. Add Sentry error tracking
4. Add session cleanup Vercel Cron
5. Remove `unsafe-eval` from production CSP

### Phase 2: Data Integrity & Core Product (Week 2-3)
6. Add CHECK constraints and FK for staffId
7. Investigate and fix Google Wallet integration
8. Add location coordinates to Apple Wallet passes
9. Set `sharingProhibited: true` on passes
10. Implement endowed progress (1 stamp on registration)
11. Lower default visitsRequired to 8

### Phase 3: Engagement & Growth (Week 4-6)
12. Add goal-proximity push notifications (2 visits away + 3 days idle)
13. Add manual scan fallback (phone number entry)
14. Build loyalty-specific analytics dashboard
15. Add unit tests for core business logic (scan, top-up, reward cycle)
16. Move push notifications to async queue

### Phase 4: Differentiation (Month 2+)
17. Add surprise/random reward mechanism for tenant admins
18. Add referral rewards (earn stamp for referring a friend)
19. Add `relevantDate` and time-based triggers
20. Explore subscription model for high-frequency tenants

---

## 6. Competitive Positioning Assessment

| Feature | Starbucks | McDonald's | Square Loyalty | Umi Cash | Gap |
|---------|-----------|------------|----------------|----------|-----|
| Stamp/point earning | Points/$ | Points/$ | Stamps | Stamps | OK |
| Mobile wallet passes | Both | Both | Neither | Apple only* | HIGH |
| Location triggers | Yes | Yes | N/A | No | HIGH |
| Balance/prepaid | Yes | No | No | Yes | ADVANTAGE |
| Push notifications | Rich | Rich | Basic | Basic | MEDIUM |
| Surprise rewards | Yes | Yes | No | No | MEDIUM |
| Referral program | No | No | No | No | EVEN |
| Multi-tenant SaaS | N/A | N/A | Yes | Yes | OK |
| Gift cards | Yes | No | No | Yes | ADVANTAGE |
| Analytics dashboard | Internal | Internal | Basic | Basic | OK |
| QR scan workflow | Customer shows | Customer shows | Business shows | Customer shows | OK |
| Offline capability | Full app | Full app | N/A | None | MEDIUM |

*Google Wallet code exists but has 0% real adoption

**Umi Cash advantages over SMB competitors (Square Loyalty, Fivestars):**
- Apple + Google Wallet native integration (when Google is fixed)
- Prepaid balance management (uncommon in SMB loyalty platforms)
- Gift card system with email/WhatsApp delivery
- Dynamic stamp strip image generation (visual richness)
- Multi-tenant white-label with tenant branding

**Key differentiators to protect:**
1. Wallet pass integration (this is the core value prop — ensure it's bulletproof)
2. Balance management (unique for SMBs — most loyalty platforms don't handle money)
3. Zero-app-download experience (web + wallet pass, no app required)

These three features are what make Umi Cash compelling for the target market. The architecture review should prioritize ensuring these features are robust, performant, and reliable.
