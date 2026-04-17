# Soft Restaurant POS — Integration Analysis

## What is Soft Restaurant?

- **Developer:** National Soft de México S.A. de C.V. (Mérida, Yucatán, since 1988)
- **Market position:** #1 restaurant POS in Mexico, 40,000+ installations
- **Users:** Restaurants, cafés, bars, nightclubs, food trucks, dark kitchens, hotel restaurants, franchises
- **Tech stack:** Windows-based (Delphi + .NET), Microsoft SQL Server Express

### Versions in the Wild

| Version | Type | Status |
|---------|------|--------|
| **Soft Restaurant 11** | Desktop (Windows) | Latest, perpetual license |
| **Soft Restaurant 10** | Desktop (Windows) | Still widely deployed |
| **SRCloud** | Cloud/SaaS (browser-based) | Growing adoption, subscription model |
| **SR Móvil** | Mobile companion (iOS/Android) | Waitstaff orders |
| **SR Delivery** | Delivery orders module | Connects to Uber Eats, Rappi, DiDi Food |
| SR 9.x, 8.x | Legacy desktop | Still found in older establishments |

**Pricing:** Desktop ~$8,000–$25,000 MXN (perpetual) or SRCloud monthly subscription.

---

## API & Integration Capabilities

### SRCloud (Cloud Version) — Limited REST API Exists

- **REST API** exists but is **not publicly documented**
- Access requires becoming a **partner or authorized integrator** through National Soft
- Authentication: **API keys** per integration partner (not OAuth)
- No public developer portal (no developer.nationalsoft.com.mx)
- No webhooks — integration requires polling

**Known API capabilities** (inferred from delivery platform integrations):
- Menu/catalog management (read items, prices, categories)
- Order injection (creating orders from external sources)
- Order status (reading ticket status)
- Sales reporting (reading closed tickets, totals)

**Not confirmed via API:**
- Customer management / CRM
- Loyalty points or promotions
- Payment details at line-item level

### Desktop Versions (SR 10/11) — No API

- **No REST API, no SOAP API, no webhooks**
- Integration is done via **direct SQL Server database access**
- This is the most common and practical method for the vast majority of installations

---

## Database Schema (SR 10/11)

The desktop versions use Microsoft SQL Server Express. Database name is typically `SoftRestaurant10` or `SoftRestaurant11`.

### Key Tables

| Table | Contents | Use for Umi |
|-------|----------|-------------|
| `cheques` | Tickets/checks (main transaction table) | **Ticket totals, timestamps** |
| `chequesdetalle` | Line items per ticket | Item-level detail |
| `productos` | Menu items/products | Product catalog |
| `turnos` | Shifts | Shift-level reporting |
| `meseros` | Waitstaff | Associate visit with staff |
| `clientes` | Customers (if CRM module active) | Customer matching |
| `formasdepago` | Payment methods | Payment type tracking |
| `cortesdecaja` | Cash register cuts | End-of-day reconciliation |
| `descuentos` | Discounts applied | Track loyalty discount usage |

### Example Queries

```sql
-- Closed tickets with totals (last 24 hours)
SELECT folio, fecha, total, propina, descuento, idmesero, idturno
FROM cheques
WHERE cancelado = 0 AND pagado = 1
  AND fecha >= DATEADD(hour, -24, GETDATE())
ORDER BY fecha DESC;

-- Line items for a specific ticket
SELECT cd.idcheque, cd.idproducto, p.descripcion, cd.cantidad, cd.precio
FROM chequesdetalle cd
JOIN productos p ON cd.idproducto = p.idproducto
WHERE cd.idcheque = @ticketId;
```

**Note:** The schema is not officially documented by National Soft but is well-known in the Mexican restaurant tech community through reverse engineering. Schema may vary between versions.

---

## Existing Third-Party Integrations

| Integration | Method | Notes |
|-------------|--------|-------|
| Uber Eats, Rappi, DiDi Food | SR Delivery module + Ordatic middleware | Confirms structured data exchange exists |
| SAT CFDI (fiscal invoicing) | Built-in | PAC providers: Facturama, Finkok |
| Bank payment terminals | Built-in | Banorte, BBVA, etc. |
| CONTPAQi, Aspel | Export | Mexican accounting software |
| OpenTable | Mentioned in some contexts | Reservations |

### No external loyalty platform integration exists — this is a green field opportunity for Umi.

---

## Integration Approaches for Umi

### Approach A: Manual Ticket Entry (Fastest — No Integration)

Staff enters the ticket total into Umi after each transaction.

```
Customer pays → Staff scans loyalty QR → Enters $85 MXN → Visit + amount recorded
```

| Pros | Cons |
|------|------|
| Zero technical integration | Friction for staff |
| Works with ANY POS, any version | Potential for errors/fraud |
| Launch immediately | No line-item detail |
| Validates concept before investing | Extra step in workflow |

**Best for:** Phase 1 launch, proving the concept, tenants who want revenue tracking without IT setup.

### Approach B: SQL Server Agent (Best for SR 10/11 Desktop)

A lightweight Windows service installed on the restaurant's SR server reads the `cheques` table and syncs to Umi's API.

```
SR closes ticket → Agent polls DB every 30s → Detects new closed ticket
→ POSTs to Umi API: { folio, total, timestamp, items[] }
→ Umi matches with loyalty visit (if QR was scanned) or stores for analytics
```

| Pros | Cons |
|------|------|
| Real-time transaction data | Requires Windows software installation |
| Complete ticket totals + line items | Restaurant must grant DB access |
| Works with majority of SR installs | Schema may change between versions |
| No National Soft partnership needed | IT support burden per restaurant |

**Technical requirements:**
- Windows service or tray app (.NET or Go)
- SQL Server connection string (localhost, sa or read-only user)
- HTTPS POST to Umi API with ticket data
- Resilient queue (retry on network failure)
- Auto-update mechanism

**Key challenge:** Matching a Soft Restaurant ticket to a Umi loyalty visit. Options:
1. **Timestamp matching** — ticket closed within ±5 min of QR scan
2. **Manual association** — staff links the ticket number to the loyalty scan
3. **Umi tablet at register** — scan QR at payment, enter ticket number

### Approach C: SRCloud API (Best for Cloud Customers)

Partner with National Soft, get API credentials, poll for completed transactions.

| Pros | Cons |
|------|------|
| Clean, supported integration | Requires formal partnership |
| No on-premise installation | SRCloud adoption still growing |
| Future-proof | API scope may be limited |
| Zero IT burden for restaurant | Partnership timeline unknown |

**Steps to pursue:**
1. Contact National Soft partnership team (ventas@nationalsoft.com.mx)
2. Request API documentation for SRCloud
3. Propose Umi as value-add loyalty platform for their ecosystem
4. Sign NDA, get API credentials
5. Build integration

### Approach D: File/Export Watcher

Configure SR to auto-export end-of-day sales to a folder. A watcher parses CSV/XML.

| Pros | Cons |
|------|------|
| Low-tech, minimal intrusion | Not real-time |
| No DB access needed | Limited data, brittle format |
| Simple implementation | Requires manual SR configuration |

**Verdict:** Not recommended as primary approach — too limited and unreliable.

---

## Recommended Phased Strategy

### Phase 1 — Manual Entry (Now)
- Add optional `ticketAmountCentavos` field to the visit/scan flow
- Staff scans loyalty QR → optionally enters ticket amount
- Revenue metrics use real ticket amounts when available, fall back to avg ticket estimate
- **Zero integration dependency — works with Soft Restaurant or any other POS**

### Phase 2 — SQL Server Agent (1–3 months)
- Build lightweight Windows agent for SR 10/11
- Needs hands-on access to a Soft Restaurant installation to validate schema
- Start with the client who uses SR — they become the pilot
- Agent runs as Windows service, polls every 30 seconds
- Push ticket data to Umi API

### Phase 3 — National Soft Partnership (3–6 months)
- Contact National Soft with production customer traction from Phase 1–2
- Explore SRCloud API access
- Position Umi as a loyalty add-on for their ecosystem
- Having paying customers gives leverage in the partnership conversation

### Phase 4 — Other POS Systems (6+ months)
- Square (has public API — easiest)
- Clip (Mexican payment processor, growing POS features)
- POSist, Toast (if expanding beyond Mexico)

---

## What This Unlocks for Revenue Tracking

With actual ticket data from Soft Restaurant, Umi's analytics upgrade from estimates to actuals:

| Metric | Without POS | With SR Integration |
|--------|-------------|---------------------|
| Revenue per visit | Estimated (avg ticket) | **Exact** |
| Revenue per customer | Estimated | **Exact LTV** |
| Basket size trend | Not possible | **Available** |
| Loyalty vs non-loyalty spend | Not possible | **Comparison available** |
| Popular items for loyalty customers | Not possible | **Line-item analysis** |
| Reward ROI | Estimated | **Exact** |

---

## Open Questions

1. **Which SR version does the client use?** — Determines whether we need Approach B (desktop) or C (cloud)
2. **Will the client grant DB read access?** — Need to ask; some owners are protective of their POS data
3. **Exact SR 11 schema** — Need hands-on access to confirm table/column names
4. **National Soft partnership willingness** — Unknown until we make contact
5. **Agent distribution** — How do we install/update the Windows agent remotely? (MSI installer + auto-update service)
6. **Ticket-to-visit matching** — Which approach works best in practice? Needs field testing

---

## National Soft Contact Info

- **Website:** nationalsoft.com.mx / softrestaurant.com.mx
- **Headquarters:** Mérida, Yucatán, Mexico
- **Sales/Partnerships:** ventas@nationalsoft.com.mx (or contact form)
- **Support:** soporte@nationalsoft.com.mx
- **Knowledge base:** support.nationalsoft.com.mx
- **YouTube:** National Soft channel (tutorials, demos)
