# Loyalty Revenue Calculation & Metrics

## The Core Problem

Umi is a standalone loyalty platform — no POS integration. We don't know actual transaction amounts per visit. Revenue tracking must work without point-of-sale data while still giving tenant owners a clear picture of whether their loyalty program is paying off.

---

## Metrics Framework

### Tier 1 — Trackable Today (No Changes Needed)

These metrics come from data already in the database.

| Metric | Source | Query |
|--------|--------|-------|
| Total visits (all time) | `Visit` table | `COUNT(*)` per tenant |
| Visits this period (week/month) | `Visit` table | `COUNT(*) WHERE scannedAt > period` |
| Active customers | `LoyaltyCard` | Cards with visit in last 30 days |
| New registrations | `LoyaltyCard.createdAt` | `COUNT(*) WHERE createdAt > period` |
| Rewards redeemed | `Visit` where reward was given | Count of reward redemptions |
| Pending rewards | `LoyaltyCard.pendingRewards` | `SUM(pendingRewards)` |
| Monedero top-ups | `Transaction` table | `SUM(amountCentavos) WHERE type = TOPUP` |
| Monedero spend | `Transaction` table | `SUM(amountCentavos) WHERE type = SPEND` |
| Monedero balance (all customers) | `LoyaltyCard.balanceCentavos` | `SUM(balanceCentavos)` |

### Tier 2 — Estimated Revenue (Needs avg ticket config)

Tenant configures one number: **average ticket value** (e.g., $85 MXN). This unlocks revenue estimates.

| Metric | Formula | Example |
|--------|---------|---------|
| **Estimated revenue (period)** | Visits × avg ticket | 320 visits × $85 = $27,200 MXN |
| **Reward cost (period)** | Rewards redeemed × reward cost | 28 × $65 = $1,820 MXN |
| **Net loyalty value** | Estimated revenue − reward cost | $27,200 − $1,820 = $25,380 MXN |
| **ROI ratio** | Estimated revenue ÷ reward cost | $27,200 ÷ $1,820 = **14.9x** |
| **Cost per visit** | Reward cost ÷ visits between rewards | $65 ÷ 10 = $6.50 MXN per visit |
| **Birthday ROI** | Birthday visits × avg ticket − birthday reward cost | Per birthday season |

### Tier 3 — Behavioral / Retention Metrics

| Metric | Formula | Why it matters |
|--------|---------|----------------|
| **Visit frequency** | Total visits ÷ active customers ÷ months | Are customers coming more often? |
| **Retention rate (30d)** | Customers with visit in last 30d ÷ total customers | Are we keeping them? |
| **Churn rate (90d)** | Customers with NO visit in 90d ÷ total | Who are we losing? |
| **Time between visits** | Avg days between consecutive visits per customer | Getting shorter = good |
| **Reward completion rate** | Customers who completed a cycle ÷ total active | Are people reaching the goal? |
| **Reward redemption rate** | Rewards redeemed ÷ rewards earned | Are they coming back to claim? |
| **Days to complete cycle** | Avg days from first visit to cycle completion | How long does a full cycle take? |
| **Second-cycle rate** | Customers who started cycle 2 ÷ completed cycle 1 | Long-term stickiness |

### Tier 4 — Comparative (Future, Needs POS)

These require actual transaction data from a POS system (Square, Clip, etc.).

| Metric | What it tells you |
|--------|-------------------|
| Loyalty vs non-loyalty avg ticket | Do loyalty members spend more? |
| Basket size trend over time | Does spending grow as customers become regulars? |
| Actual revenue per customer | True LTV calculation |
| Reward program profitability | Exact cost vs exact revenue |

---

## Database Changes Required

```prisma
model Tenant {
  // ... existing fields
  avgTicketCentavos          Int?   // Average ticket value in centavos (e.g., 8500 = $85 MXN)
  rewardCostCentavos         Int?   // Cost to business per redeemed reward (e.g., 6500 = $65)
  birthdayRewardCostCentavos Int?   // Cost of birthday reward to business
}
```

That's it — three optional fields on Tenant. Everything else is derived from existing data.

---

## Admin Dashboard Design

### Summary Cards (Top Row)

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Ingresos est.   │  │  Clientes activos │  │  Visitas (mes)   │  │  ROI recompensas │
│  $27,200 MXN     │  │  89               │  │  320              │  │  14.9x           │
│  ↑ 12% vs prev   │  │  ↑ 5 nuevos       │  │  ↑ 8% vs prev    │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Charts

1. **Visits over time** — Daily/weekly bar chart showing visit volume (existing data)
2. **Estimated revenue over time** — Line chart (visits × avg ticket per period)
3. **Customer retention funnel** — Active (30d) → Warm (60d) → At risk (90d) → Churned
4. **Reward cycle completion** — How many customers complete each cycle (1st, 2nd, 3rd...)

### Tables

1. **Top customers** — Ranked by total visits, with last visit date and current cycle progress
2. **Recent rewards redeemed** — Date, customer, reward name
3. **Birthday rewards** — Upcoming birthdays this month, redemption status

---

## Key Formulas Explained

### Estimated Revenue
```
estimated_revenue = visits_in_period × (avgTicketCentavos / 100)
```
Conservative and directional. The tenant knows their average ticket better than anyone — baristas see every order. Most café owners in Mexico can estimate this within ±10%.

### Reward Cost
```
reward_cost = rewards_redeemed_in_period × (rewardCostCentavos / 100)
```
This is the **cost to the business**, not the retail price. A free coffee that sells for $65 MXN might cost the café $15–20 in ingredients. Tenants can configure either — we recommend using **retail price** since that's what the customer perceives as value, and it's the conservative calculation for ROI.

### Net Loyalty Value
```
net_value = estimated_revenue - reward_cost
```
Answers: "How much revenue did the loyalty program drive, minus what I gave away?"

### Customer Lifetime Value (Estimated)
```
eLTV = avg_visits_per_month × avg_ticket × avg_customer_lifespan_months
```
Where lifespan = months from first visit to last visit (for churned customers) or ongoing estimate for active ones. Even without POS data, this gives tenants a rough LTV number.

### Cost of Acquisition
```
cost_per_acquired_customer = total_rewards_given_to_new_customers / new_customers
```
For new customers who register and receive any incentive (birthday reward, first-visit bonus, etc.).

---

## What Tenants Actually Want to Know

Based on small business loyalty programs in Mexico, owners care about these questions (in order of priority):

1. **"¿Me está funcionando?"** (Is it working?) → Visit trend + active customers
2. **"¿Cuánto me cuesta?"** (How much does it cost me?) → Reward cost total
3. **"¿Están regresando?"** (Are they coming back?) → Retention rate + visit frequency
4. **"¿Cuánto me genera?"** (How much does it generate?) → Estimated revenue + ROI ratio
5. **"¿Quiénes son mis mejores clientes?"** (Who are my best customers?) → Top customer list

The dashboard should answer these five questions at a glance. Everything else is secondary.

---

## Implementation Phases

### Phase 1 — Config + Basic Metrics
- Add `avgTicketCentavos`, `rewardCostCentavos` to Tenant model
- Admin settings UI to configure these values
- Summary cards: estimated revenue, visits, active customers, reward cost
- Time period selector: this week / this month / last 30 days / custom

### Phase 2 — Retention & Behavioral
- Retention rate calculation (30/60/90 day buckets)
- Visit frequency trends
- Reward cycle completion rates
- Top customers table
- Charts (visits over time, revenue estimate over time)

### Phase 3 — Advanced (Future)
- Birthday reward ROI tracking
- Customer cohort analysis (group by registration month)
- Churn prediction (flag customers slowing down)
- Export to CSV/PDF for tenant owners
- POS integration (Square, Clip) for actual transaction data

---

## Comparison: What Competitors Show

| Platform | Revenue tracking | POS integration | Retention metrics |
|----------|-----------------|-----------------|-------------------|
| Stamp Me | Basic visit counts | No | No |
| Loopy Loyalty | Visit counts + stamp stats | No | Basic |
| Square Loyalty | Full (built into POS) | Native | Full |
| Belly (discontinued) | Estimated via avg ticket | No | Basic |
| **Umi (proposed)** | Estimated via avg ticket + monedero actual | No (Phase 3) | Full retention funnel |

Umi's approach is competitive — most standalone loyalty platforms don't offer revenue estimation at all. The avg ticket approach is pragmatic and honest.

---

## Risks & Considerations

1. **Avg ticket accuracy** — Garbage in, garbage out. If the tenant sets $85 but real average is $60, all estimates are inflated. Mitigate by suggesting they check their POS reports for the real number, and add a disclaimer: "Estimación basada en ticket promedio configurado."

2. **Visits ≠ purchases** — A customer could scan QR and not buy (unlikely but possible with fraud). The scan = visit assumption is reasonable for honest businesses.

3. **Monedero overlap** — If a customer pays with their monedero balance, that visit's revenue is already tracked via top-up. Avoid double-counting by showing monedero revenue separately.

4. **Seasonality** — Café visits vary by season, holidays, weather. Month-over-month comparisons need context. Consider showing year-over-year when enough data exists.

5. **Privacy** — Revenue metrics should only be visible to ADMIN role, never to STAFF or CUSTOMER. Per-customer revenue estimates could feel invasive if exposed.
