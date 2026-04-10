# Data Model Assessment — Umi Cash

**Date:** 2026-03-28
**Database:** Supabase PostgreSQL 17.6.1 (project `rrkzhisnadfrgnhntkiz`, region `us-west-2`)
**ORM:** Prisma 5.17.0
**Tables:** 12 (11 application + 1 `_prisma_migrations`)
**Total rows:** ~99 (early production/staging)

---

## 1. Schema Overview

```
Tenant (2 rows)
├── Location (3 rows)
├── User (9 rows: 5 CUSTOMER, 2 STAFF, 2 ADMIN)
│   ├── Session (35 rows)
│   └── LoyaltyCard (5 rows, 1:1 with User)
│       ├── Visit (16 rows)
│       ├── Transaction (19 rows)
│       ├── RewardRedemption (0 rows)
│       ├── ApplePushToken (2 rows)
│       └── GiftCard.redeemedCardId (1 row)
├── RewardConfig (9 rows: 2 active, 7 historical)
└── GiftCard (1 row)
```

---

## 2. Schema Issues

### 2.1 Missing Foreign Key Constraints (HIGH)

**Visit.staffId** and **Transaction.staffId** are `text NOT NULL` columns with **no foreign key** to `User.id`.

```sql
-- Current: no FK
CREATE TABLE "Visit" (
  "staffId" text NOT NULL,  -- No FK constraint
  ...
);
```

**Impact:**
- A deleted staff user's ID remains in Visit/Transaction records with no referential integrity
- Invalid staffId values can be written without database-level protection
- JOIN queries to fetch staff details may silently return no rows for orphaned IDs

**Recommendation:** Add `REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE`.

### 2.2 Missing CHECK Constraints (HIGH)

Only `NOT NULL` checks exist. No domain validation at the database level:

| Table | Column | Missing Constraint |
|-------|--------|--------------------|
| LoyaltyCard | `balanceCentavos` | `CHECK (balanceCentavos >= 0)` |
| LoyaltyCard | `totalVisits` | `CHECK (totalVisits >= 0)` |
| LoyaltyCard | `visitsThisCycle` | `CHECK (visitsThisCycle >= 0)` |
| LoyaltyCard | `pendingRewards` | `CHECK (pendingRewards >= 0)` |
| User | `role` | `CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN'))` |
| Tenant | `subscriptionStatus` | `CHECK (subscriptionStatus IN ('ACTIVE', 'SUSPENDED', 'TRIAL'))` |
| Transaction | `type` | `CHECK (type IN ('TOPUP', 'PURCHASE', 'ADJUSTMENT'))` |
| Transaction | `amountCentavos` | `CHECK (amountCentavos != 0)` |
| GiftCard | `amountCentavos` | `CHECK (amountCentavos > 0)` |
| RewardConfig | `visitsRequired` | `CHECK (visitsRequired > 0)` |

**Impact:** Application-level bugs or direct DB access could write invalid values. A race condition in concurrent top-up/purchase could theoretically produce a negative balance.

### 2.3 Missing Visit-to-Location Relationship (MEDIUM)

The `Location` table exists with 3 rows (business branches) but `Visit` has no `locationId` column. This is a structural gap — the platform supports multi-location tenants but cannot track which location a visit occurred at.

```sql
-- Missing:
ALTER TABLE "Visit" ADD COLUMN "locationId" text REFERENCES "Location"(id);
```

**Impact:**
- No per-location analytics (visits per branch, busiest branch)
- Location table is effectively orphaned (only used for display, not for data linkage)

### 2.4 Inconsistent ON DELETE Behavior (MEDIUM)

| FK | ON DELETE | Analysis |
|----|----------|----------|
| `LoyaltyCard.userId → User` | **CASCADE** | Deleting user cascades to card |
| `Visit.cardId → LoyaltyCard` | **RESTRICT** | Can't delete card if visits exist |
| `Transaction.cardId → LoyaltyCard` | **RESTRICT** | Can't delete card if transactions exist |
| `Session.userId → User` | **CASCADE** | Good — cleanup |
| `ApplePushToken.cardId → LoyaltyCard` | **CASCADE** | Good — cleanup |
| `GiftCard.tenantId → Tenant` | **CASCADE** | Deleting tenant cascades gift cards |
| `LoyaltyCard.tenantId → Tenant` | **RESTRICT** | Can't delete tenant if cards exist |
| `GiftCard.redeemedCardId → LoyaltyCard` | **SET NULL** | Good — preserves gift card record |
| `RewardRedemption.cardId → LoyaltyCard` | **RESTRICT** | Good — preserves history |
| `RewardRedemption.configId → RewardConfig` | **RESTRICT** | Good — preserves history |

**Problem:** The cascade chain User → LoyaltyCard would trigger, but then RESTRICT on Visit → LoyaltyCard and Transaction → LoyaltyCard would **block the cascade**. Attempting to delete a user who has visited or transacted will fail with an FK violation.

This is either an accidental inconsistency or an intentional "soft prevention" — but it's not documented and could cause confusion.

**Recommendation:** Use RESTRICT everywhere for financial entities. Implement soft-delete (`deletedAt` timestamp) for User and LoyaltyCard instead of hard delete.

### 2.5 No Session Expiry Management (MEDIUM)

The `Session` table has 35 rows for 9 users. Sessions are created on login but never deleted:
- No cleanup on logout (only cookie is cleared)
- No cron job to purge expired sessions
- No maximum sessions-per-user limit
- The index on `token` allows fast lookup, but table growth is unbounded

At current scale this is fine, but at 1,000+ users with 30-day sessions, the table could grow to 10,000+ rows unnecessarily.

### 2.6 No Enumerated Types (MEDIUM)

PostgreSQL supports native ENUM types, but all categorical columns are `text`:
- `User.role` — should be `user_role ENUM ('CUSTOMER', 'STAFF', 'ADMIN')`
- `Transaction.type` — should be `transaction_type ENUM ('TOPUP', 'PURCHASE', 'ADJUSTMENT')`
- `Tenant.subscriptionStatus` — should be `subscription_status ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL')`
- `Tenant.passStyle` — should be `pass_style ENUM ('default', 'stamps')`

**Note:** Prisma supports PostgreSQL ENUMs natively in the schema.

### 2.7 RewardConfig History Pattern (LOW — Design Observation)

The pattern of deactivating old configs and creating new ones (9 configs for 2 tenants = 4.5 per tenant) is an append-only history pattern. This is good for audit — but:
- There's no composite index on `(tenantId, isActive)` — the existing index is `(tenantId, isActive, activatedAt)` which works but could be simplified
- Multiple active configs per tenant is prevented only at the application level, not at the database level. A `UNIQUE WHERE (isActive = true)` partial index per tenant would enforce this.

### 2.8 GiftCard.createdByStaffId Not Foreign-Keyed (LOW)

Similar to Visit/Transaction staffId, the `GiftCard.createdByStaffId` is a plain text column with no FK to User.

---

## 3. Performance Assessment

### 3.1 Index Coverage (GOOD)

The indexing strategy is comprehensive for the current query patterns:

| Table | Indexes | Assessment |
|-------|---------|------------|
| LoyaltyCard | 7 indexes (PK + 6 unique/non-unique) | Well-covered |
| Transaction | 5 indexes (PK + 4 composite/single) | Good — composite indexes for daily limit checks |
| Visit | 4 indexes (PK + 3) | Good — covers cardId, scannedAt, composite |
| User | 5 indexes (PK + 4) | Good — composite unique on (tenantId, phone) and (tenantId, email) |
| Session | 3 indexes (PK + 2) | Adequate |
| GiftCard | 5 indexes (PK + 4) | Comprehensive |
| RewardConfig | 2 indexes (PK + 1 composite) | Adequate |

**Potential over-indexing:** GiftCard has both a `code_idx` and `code_key` (unique). The unique constraint already creates an index, so the separate `code_idx` is redundant.

### 3.2 Table Sizes

All tables are at 8-16KB data with 24-120KB index overhead. At current scale, there are no performance concerns. Projected concerns at 10,000+ users:

- **Session table**: Could grow to 50,000+ rows without cleanup
- **Visit table**: At 1 visit/day per active user, ~300K rows/year for 1,000 users
- **Transaction table**: Similar growth to Visit

The existing indexes should handle these volumes well through 100K+ rows.

### 3.3 Missing Partial Indexes

For common filtered queries, partial indexes could improve performance:
- `CREATE INDEX ON "RewardConfig" ("tenantId") WHERE "isActive" = true` — Frequently queried, only 2 rows match
- `CREATE INDEX ON "Session" ("expiresAt") WHERE "expiresAt" > NOW()` — For session cleanup queries

### 3.4 Timestamp Without Time Zone

All timestamp columns use `timestamp without time zone`. For a Mexico-focused application, this works if the application consistently stores UTC. However, `timestamptz` (timestamp with time zone) is the PostgreSQL best practice because:
- It explicitly handles timezone conversion
- It prevents ambiguity when the server timezone changes
- It's what PostgreSQL documentation recommends for production

---

## 4. Integrity Validation

### 4.1 Current Data Integrity (GOOD)

All integrity checks passed:

| Check | Result |
|-------|--------|
| Sessions without valid user | 0 |
| Cards without valid user | 0 |
| Visits without valid card | 0 |
| Transactions without valid card | 0 |
| Cards with negative balance | 0 |
| Cards with visitsThisCycle > totalVisits | 0 |
| Expired sessions still in DB | 0 |
| Users without valid tenantId | 0 |
| Multiple active reward configs per tenant | 0 |

**Assessment:** The application logic is correctly maintaining data integrity. However, this is enforced only at the application level — the database would accept invalid states.

### 4.2 Row-Level Security (CRITICAL)

**RLS is disabled on all 12 tables.**

Since this is a Supabase PostgreSQL instance, the PostgREST API is exposed at `https://rrkzhisnadfrgnhntkiz.supabase.co/rest/v1/`. Without RLS:
- The `anon` API key (typically embedded in client-side code) grants full read/write access to all tables
- Even if the app doesn't use the Supabase client library, the REST API is still accessible

This is the **#1 security priority** for the database layer.

---

## 5. Data Model Diagram (Logical)

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Tenant    │───<│   Location   │    │  RewardConfig   │
│             │    └──────────────┘    │  (versioned)    │
│ slug (UK)   │                        │                 │
│ name        │───<────────────────────│ tenantId (FK)   │
│ branding    │                        │ isActive        │
│ subscription│                        └────────┬────────┘
└──────┬──────┘                                  │
       │                                         │
       │1:N                                      │
┌──────┴──────┐     ┌──────────────┐    ┌────────┴────────┐
│    User     │────<│   Session    │    │RewardRedemption │
│             │     └──────────────┘    │                 │
│ phone (UK)  │                         │ cardId (FK)     │
│ email (UK)  │                         │ configId (FK)   │
│ role        │                         │ staffId (!!!)   │
│ passwordHash│                         └─────────────────┘
└──────┬──────┘
       │1:1
┌──────┴──────┐     ┌──────────────┐    ┌─────────────────┐
│ LoyaltyCard │────<│    Visit     │    │   Transaction   │
│             │     │              │    │                 │
│ cardNumber  │     │ cardId (FK)  │    │ cardId (FK)     │
│ balance     │     │ staffId (!!!)│    │ staffId (!!!)   │
│ visits      │     └──────────────┘    │ type            │
│ rewards     │                         │ amount          │
│ qrToken     │                         └─────────────────┘
│ applePas... │
│ googlePas.. │     ┌──────────────┐    ┌─────────────────┐
└──────┬──────┘     │ApplePushToken│    │    GiftCard     │
       │            │              │    │                 │
       └───────────<│ cardId (FK)  │    │ tenantId (FK)   │
                    │ deviceToken  │    │ code (UK)       │
                    │ pushToken    │    │ redeemedCardId  │
                    └──────────────┘    └─────────────────┘

(!!!) = staffId has NO foreign key constraint
(UK) = Unique Key
(FK) = Foreign Key
```

---

## 6. Recommendations Summary

| Priority | Action | Impact |
|----------|--------|--------|
| **P0** | Enable RLS on all tables | Security: prevents unauthorized data access |
| **P1** | Add CHECK constraints for balances, roles, types | Integrity: prevents invalid states |
| **P1** | Add FK for staffId on Visit, Transaction, RewardRedemption | Integrity: referential consistency |
| **P1** | Implement session cleanup cron | Performance: prevents table bloat |
| **P2** | Add locationId to Visit | Analytics: per-location tracking |
| **P2** | Standardize ON DELETE to RESTRICT + soft-delete | Consistency: predictable behavior |
| **P2** | Add PostgreSQL ENUMs for categorical columns | Type safety |
| **P3** | Migrate timestamps to `timestamptz` | Best practice |
| **P3** | Remove redundant GiftCard.code_idx (code_key already indexes) | Cleanup |
| **P3** | Add partial unique index for active RewardConfig per tenant | Constraint enforcement |
