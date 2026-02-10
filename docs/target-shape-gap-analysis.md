# Bakery Ops App Review & Improvement Plan (Aligned to Business Model)

## 1) Executive Summary

The app already has strong foundations for your target model: role-based access, inventory, batch sending, POS sales capture, expenses, reports, notifications, and activity logging.

However, to reliably reach the business outcomes you listed (waste reduction, sub-20s cashier flow, daily owner reporting, offline reliability, and multi-branch readiness), the codebase needs targeted fixes in **data consistency**, **offline workflows**, **multi-branch model**, **report completeness**, and **productization (pricing/tiers/onboarding/observability)**.

---

## 2) What Is Already in Good Shape

- Role-based routing and protection for Admin/Manager/Cashier flows.
- Dedicated workflows for manager inventory batching and cashier sales.
- Core backend modules: auth, products, inventory, sales, expenses, payments, reports, notifications, and activity.
- Database schema includes most required entities, including `sync_queue` and audit logs.
- Daily/weekly/monthly reporting endpoints exist.

---

## 3) Key Gaps vs Target Business Model

## A. Platform Reliability & Data Integrity (High Priority)

1. **Transaction handling is unsafe in critical flows.**
   - Sales and inventory-batch routes call `BEGIN/COMMIT/ROLLBACK` through the shared query helper instead of a dedicated DB client/transaction context.
   - Risk: partial writes under concurrent load or failures.

2. **Inventory deduction on sales can silently fail.**
   - Sale creation continues even if inventory update affects 0 rows (`quantity >= requested` check can fail), allowing oversell and inaccurate stock.

3. **No optimistic locking/versioning or clear stock-reservation policy.**
   - Can create race conditions during busy cashier usage.

## B. Offline-First Promise Is Not Implemented End-to-End (High Priority)

1. **Frontend local persistence is only used for auth token/user.**
2. **`sync_queue` exists in schema but is not wired into client sync logic.**
3. **No resilient retry queue, conflict handling, or reconciliation UI.**

Result: the app currently behaves as online-first, not truly offline-first as required by your model.

## C. Multi-Branch/Location Readiness Is Incomplete (High Priority)

1. **Location model exists in DB, but branch-management experience is incomplete.**
2. **Frontend references `/locations` in manager batches page, but backend route is missing.**
3. **No consolidated cross-branch dashboard/reporting workflow yet.**

## D. Reporting/KPI Alignment Gaps (High Priority)

1. **UI report placeholders indicate missing analytics pieces.**
   - Sales-by-category and payment-method sections are partially stubbed.
2. **Weekly report endpoint currently computes a fixed 7-day window and ignores client-provided `start_date`.**
3. **KPIs from your success criteria are not yet first-class metrics (batch retry rates, order processing latency, stock variance, waste trend, onboarding-to-first-batch time).**

## E. Product/UX Fit for Speed and Adoption (Medium Priority)

1. **Cashier speed path lacks explicit performance instrumentation.**
   - No timer/telemetry for “<20s typical order”.
2. **No guided onboarding/templates in product yet.**
3. **Manager and admin screen reuse works but reduces role-specific clarity and can confuse responsibilities.**

## F. Security, Operations, and Scale Readiness (Medium Priority)

1. **Excessive DB debug logging in production code.**
2. **No visible rate limiting, idempotency strategy for repeated submits, or robust observability stack.**
3. **No explicit tenant/location isolation tests for role/location boundaries.**

---

## 4) Recommended Target Architecture (Practical)

- **Frontend**: Keep React/Vite; add offline data layer (IndexedDB + queue abstraction + retry engine).
- **Backend**: Keep Express/Postgres; add proper transaction helper (`pool.connect()`) and idempotent mutation endpoints.
- **Data model additions**:
  - stock movements ledger (`inventory_movements`)
  - retry attempts/status timestamps for sync events
  - branch-level KPI aggregates (materialized views optional)
- **Observability**:
  - structured logs
  - API latency metrics
  - business metrics events (order duration, retry count, stock variance)

---

## 5) Phased Delivery Plan

## Phase 0 (1–2 weeks) — Stabilization & Correctness

- Fix transaction handling in sales and inventory batch creation with real DB client transactions.
- Block sale commit on insufficient stock (or define explicit negative-stock policy).
- Add missing `/locations` backend route or remove dependency from UI until implemented.
- Remove noisy DB debug logs; add structured error logs.
- Add integration tests for: sale creation, rollback on failure, batch send atomicity.

**Outcome:** trusted data, fewer reconciliation errors.

## Phase 1 (2–4 weeks) — Offline-First Core

- Implement client operation queue (IndexedDB preferred) for sales/batches/expenses.
- Add background sync worker with exponential backoff and max retry policy.
- Persist failed payloads with activity history and manual retry UX.
- Wire backend `sync_queue` usage and conflict resolution rules.

**Outcome:** reliability in low-connectivity environments and measurable retry success.

## Phase 2 (3–5 weeks) — KPI & Reporting Completion

- Complete sales-by-category, payment-method breakdown, and branch comparison reports.
- Implement KPI endpoints for:
  - inventory variance
  - waste % month-over-month
  - cashier order processing duration
  - daily summary usage by owner/admin role
- Add CSV/Excel export pipeline and printable daily summary.

**Outcome:** decision-grade reporting aligned to your success criteria.

## Phase 3 (3–6 weeks) — Multi-Branch + Commercial Readiness

- Build consolidated multi-branch admin dashboard.
- Introduce role-based alerts (low stock, anomalies, budget thresholds).
- Add product tier flags (Starter/Growth/Chain) and feature gating.
- Add onboarding templates for products/categories and first-batch wizard.

**Outcome:** supports revenue tiers and smoother customer adoption.

---

## 6) Prioritized Backlog (Top 12)

1. Transaction helper refactor (shared utility) for atomic writes.
2. Enforce inventory availability check before sale commit.
3. Add missing locations API + branch selector UX.
4. Implement offline queue + background sync.
5. Add retry/audit UI with payload history.
6. Complete payment-method and category analytics pipeline.
7. Add KPI telemetry events and dashboard tiles for success criteria.
8. Improve cashier quick-add/shortcut flow and measure median order time.
9. Add notification rules engine for low stock/anomalies.
10. Implement CSV/Excel + print daily summary.
11. Add role/location isolation integration tests.
12. Introduce feature flags for pricing tiers.

---

## 7) Suggested Delivery Governance

- Weekly release cadence with demo against business KPIs.
- Definition of done for each feature includes:
  - role access checks
  - activity log entry
  - offline behavior tested
  - report impact documented
- Maintain a “north-star dashboard” with 5 targets:
  - batch success without retries
  - cashier order time
  - owner daily summary usage
  - waste reduction trend
  - stock variance trend

---

## 8) Questions to Confirm Before Execution

1. **Stock policy:** Should the system strictly block sales when stock is insufficient, or allow controlled negative inventory?
2. **Offline scope:** Which actions must work offline first in V1 (sales only, or sales + batches + expenses)?
3. **Branch model:** Do users belong to one branch only, or can admins switch across many branches in one session?
4. **Receipt/printing:** Is browser print enough for now, or do you need thermal printer integration in this phase?
5. **Pricing tiers:** Do you want feature gating enforced in backend immediately, or only reflected in UI first?
6. **KPIs:** Which 2–3 KPIs are mandatory for launch dashboard v1?

---

## 9) Recommended Next Step

If you approve, I can convert this into a detailed implementation blueprint with:
- exact API changes,
- database migrations,
- UI tasks by role,
- and a sprint-by-sprint execution board.
