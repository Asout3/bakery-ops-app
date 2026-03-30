# Bakery Operations Platform

A production-oriented, offline-capable bakery management system for multi-branch operations, designed for reliable daily execution under unstable connectivity and strict operational accountability.

**Lead Developer:** Asotu3

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Platform Outcomes](#platform-outcomes)
- [System Architecture](#system-architecture)
- [Offline Sync and Offline Refresh Design](#offline-sync-and-offline-refresh-design)
- [Security and Compliance Controls](#security-and-compliance-controls)
- [Session and Token Lifecycle](#session-and-token-lifecycle)
- [Staff Payments Behavior](#staff-payments-behavior)
- [Database Architecture](#database-architecture)
- [API Design and Contracts](#api-design-and-contracts)
- [Performance and Scalability](#performance-and-scalability)
- [Timezone Strategy](#timezone-strategy)
- [Repository Structure](#repository-structure)
- [Developer Workflow](#developer-workflow)
- [Testing Strategy](#testing-strategy)
- [Operations and Deployment](#operations-and-deployment)
- [Documentation Map](#documentation-map)
- [Production Readiness Checklist](#production-readiness-checklist)

---

## Executive Summary

The Bakery Operations Platform combines:

- **Role-based workflows** for admin, manager, and cashier responsibilities.
- **Offline-safe transaction handling** with idempotent replay semantics.
- **Inventory and batch lifecycle tracking** including archive workflows.
- **Auditable operational history** through logs, sync audit records, and traceable error contracts.

The system is intentionally engineered so day-to-day branch activity can continue through temporary internet or backend instability without corrupting sales data.

---

## Platform Outcomes

```mermaid
flowchart TB
  A[Reliability] --> A1[Offline queue replay]
  A --> A2[Idempotent writes]
  A --> A3[Conflict classification]
  B[Visibility] --> B1[Reporting]
  B --> B2[Archive dashboards]
  B --> B3[Activity logs]
  C[Security] --> C1[JWT and RBAC]
  C --> C2[Rate limiting]
  C --> C3[Helmet hardening]
  D[Scalability] --> D1[DB pooling]
  D --> D2[Query indexes]
  D --> D3[Advisory job locks]
```

### Core Business Capabilities

- Sales, expenses, payments, inventory management, waste tracking, and pre-order lifecycle orchestration.
- Grouped product variants across admin, manager, and cashier workflows (group card -> variant selection).
- Expiration-date aware inventory that automatically moves expired stock into a waste ledger and blocks expired sales.
- Dynamic expense categories with audit-friendly expense codes and creator attribution.
- Branch-aware access via role and location constraints.
- In-app and browser-level operational notifications with polling + service-worker delivery for background alerts.
- Thermal-receipt workflow with real print detection, auto/ask print modes, and consistent live-preview vs printed structure.
- Scheduled archive jobs.
- Addis Ababa timezone-consistent UI presentation.

---

## System Architecture

```mermaid
flowchart LR
  subgraph Frontend[Client Layer React Vite]
    UI[Role based pages]
    Router[React Router]
    APIClient[Axios API client]
    OfflineQ[Offline queue and replay]
    Toasts[Toast notification center]
    SW[Service Worker]
    Cache[Local cache]
  end

  subgraph Backend[API Layer Express]
    MW[Security auth middleware]
    Routes[Route Handlers]
    Services[Domain Services]
    Waste[Expiry and waste processor]
    Errors[Central Error Handler]
    Jobs[Schedulers and job locks]
  end

  subgraph Data[Data Layer PostgreSQL]
    Core[(Core transactional tables)]
    WasteLedger[(waste_records)]
    Alerts[(notifications and alert_rules)]
    Idem[(idempotency_keys)]
    Archive[(archive tables)]
    Audit[(activity and sync audit logs)]
  end

  UI --> Router --> APIClient --> MW --> Routes --> Services --> Data
  APIClient --> OfflineQ --> APIClient
  APIClient --> Toasts --> UI
  SW --> Cache --> UI
  Routes --> Waste --> WasteLedger
  Routes --> Alerts
  Routes --> Errors
  Jobs --> Services --> Data
  Data --> Core
  Data --> WasteLedger
  Data --> Alerts
  Data --> Idem
  Data --> Archive
  Data --> Audit
```

### Architecture Principles

1. Keep the API deterministic under retries.
2. Treat network volatility as a normal condition.
3. Preserve auditable event history for operations and finance.
4. Keep operational safety defaults in production.

---

## Offline Sync and Offline Refresh Design

```mermaid
sequenceDiagram
  participant User
  participant UI
  participant Queue as Offline Queue
  participant API
  participant DB

  User->>UI: Submit write action
  alt Online
    UI->>API: Request with idempotency key
    API->>DB: Transaction
    DB-->>API: Commit
    API-->>UI: Success
  else Offline
    UI->>Queue: Persist operation
    Queue-->>UI: Pending state
    Note over UI,Queue: User can navigate/refresh without losing queue
    Queue->>API: Replay when online
    API->>DB: Idempotent check and write
    DB-->>API: Existing or new result
    API-->>Queue: synced/conflict/needs_review
    Queue-->>UI: Reconciled state
  end
```

### Reliability Mechanisms

- Cashier sales history now prioritizes server data whenever `/api/sales` is reachable and only falls back to local cached receipts when the app is offline, preventing stale data from a previous database from appearing after `DATABASE_URL` changes.
- Notification schema bootstrap now runs automatically at API startup, so migrated/empty databases still create and serve notifications without manual intervention.
- Staff-payment staff lookup now handles partial schema migrations (including missing `payment_due_date`) and always returns active staff rows from the currently selected location.
- Staff-payment lookup now unions active `staff_profiles` with active manager/cashier user accounts that are not yet linked to a profile, preventing false "No active staff found" states after database URL swaps or partial migrations.
- Expense category isolation is enforced per-role: managers only list/use/delete categories they created, while admins retain full branch visibility and control.
- Expense notifications are now restricted to admins, preventing manager-side visibility of admin-only financial activity.
- History Lifecycle API calls now use long-running request timeouts for archive run/export to avoid false client-side timeout failures on large datasets.
- Batch performance was moved from Sales to Orders so order operations and batch execution history are reviewed together with richer audit context.
- Staff-payment UI data loading is now fault-tolerant: payments and staff sources are fetched independently, and the page falls back to `/api/admin/staff` when `/api/admin/staff-for-payments` is unavailable.
- Batch edit workflows now ignore already-voided stock rows from prior edits, allowing multiple valid edits within the full 20-minute window.
- Receipt reprint enforcement now honors `0` manual reprints correctly (no fallback override), and reprint window values are applied from saved settings using nullish-safe defaults.
- Cashier sales now block add/increase actions when stock is exhausted, hide expired variants, and reject expired product checkout server-side.
- Expired inventory is automatically converted into waste records with quantity, unit cost, total loss, and timestamp preservation.
- Sale-void stock restoration now writes compensating stock batches (`reference_type = sale_void`) and re-derives inventory from batch totals, preventing drift between `inventory` and `inventory_stock_batches`.
- Idempotent write headers for retry-safe replay.
- Replay status model (`synced`, `failed`, `conflict`, `needs_review`, `ignored`, `resolved`).
- Offline replay preserves the original actor identity (`X-Offline-Actor-Id`) so synced records remain attributed to the initiating cashier/manager, not the user who triggers replay later.
- Offline actor resolution now accepts branch users whose `location_id` is temporarily `NULL` after migrations/backfills, preserving original transaction ownership during replay for inventory, orders, expenses, and staff-payment writes.
- Offline replay no longer parks auth/session responses in mandatory admin-review state by default; queued actions retry with the active authenticated session and only fail after max retries.
- Sync audit ingestion now stores actor identity from authenticated server context (client-sent actor hints are retained only as metadata for diagnostics), preventing audit actor spoofing.
- Staff account roles are immutable after account creation; updates can change credentials/location but not role.
- API error envelope consistency (`error`, `code`, `requestId`) for client classification.
- Sales stock failures now return structured `INSUFFICIENT_STOCK` details so offline sync can surface actionable retry guidance (`requested_quantity` vs `available_quantity`).
- Admin dashboard cashier performance now includes Telebirr totals alongside Cash and Mobile splits for daily/weekly/monthly periods.
- Admin dashboard top-products visualization now uses a larger readable horizontal revenue chart, and the period summary now includes an explicit waste-loss line item.
- Cache fallback in key manager/cashier pages for continuity.
- Single-flight offline queue flush locking to prevent overlapping replay runs.
- Offline replay now emits an `offline-queue-synced` browser event after successful replay cycles so cashier stock views can immediately rehydrate from server truth.
- Offline sync status indicator now initializes before first auto-replay after login, so admin/manager users can see the sync panel during startup reconciliation (not just toast notifications).
- Offline replay now auto-adjusts queued sale quantities for deterministic `INSUFFICIENT_STOCK` conflicts when partial quantity is available, then retries with the adjusted payload.
- Service-worker shell caching that discovers and caches current hashed build assets from `index.html`.
- Sale create responses now include `X-Sale-Server-Timing` response metadata to support production latency profiling (`totalMs`, `productLookupMs`, `stockConsumeMs`, `movementInsertMs`).

### Important Development Note

In development mode, service workers are intentionally unregistered to prevent stale production workers from interfering with Vite dev behavior. Validate offline refresh using production build/preview behavior (`npm run build` + `npm run preview` in `client/`).

### Deployment Cache Consistency Checklist

When a remote reviewer reports they cannot see merged changes, confirm the following in order:

1. Verify both users are pointing to the same frontend URL and backend API URL (`VITE_API_URL` / rewrite target).
2. Open DevTools Application tab and force-update the service worker, then hard-refresh once.
3. Confirm `/index.html` and `/sw.js` are revalidated on each deploy while hashed `/assets/*` remain immutable.
4. Check release parity by comparing dashboard-level behavior changes (e.g., waste dashboard cards and notifications page browser-alert toggle are visible).

---

## Waste Tracking and Alerts

- Products now store an optional `expiration_date`; once that date is older than the current day, remaining on-hand inventory is automatically moved into `waste_records`.
- Each waste record stores `product_id`, `location_id`, `quantity_wasted`, `cost_per_unit`, `total_loss`, `reason`, `wasted_at`, and related metadata for auditing.
- Expired inventory processing runs before product, inventory, dashboard, and waste reads, and before sale creation, keeping operational screens accurate without needing a manual cleanup job.
- Admins have a dedicated Waste page that surfaces grouped loss by item plus current-day, current-week, and current-month waste-loss cards.
- The Waste page now includes period-scoped waste lists (daily/weekly/monthly), plus a sell-first expiring-batch queue that shows sold quantity, remaining quantity, expiry timestamp, and time-left countdown for each batch.
- Inventory low-stock notifications are triggered after manual stock edits, sales, and expiry-driven waste movements.

## Notification Delivery Model

- Notifications are fetched as full content records instead of only an unread count.
- New server notifications trigger in-app toast banners while the app is open.
- When the tab is in the background and browser permission is granted, the service worker displays OS-level browser notifications using the Notifications API.
- Duplicate alerts are suppressed client-side by tracking seen notification IDs and service-worker notification tags.

## Receipt Printing Behavior

- Receipt printing now always uses the real browser print flow (`window.print`) for sale receipts and pre-order receipts.
- On login, the app checks USB printer availability and shows a toast:
  - `Thermal printer plugged in.`
  - `Thermal printer not plugged in.`
- Optional network-printer mode is available for Wi-Fi test setups (e.g., Android POS simulator) via a preconfigured network relay connection check and print test from receipt settings.
- Network-printer calls are now host-restricted. Configure `NETWORK_PRINTER_ALLOWED_HOSTS` (comma-separated) and/or `NETWORK_PRINTER_HOST`; unlisted hosts are rejected.
- The admin receipt settings page now includes:
  - Persistent `Print Mode` (`Auto print after sale` vs `Ask every time`).
  - `Show receipt after sale` toggle to control whether the preview modal opens after checkout.
  - Tax percentage configuration (`Tax (%)`) applied in receipt totals (not header top).
  - Footer website link rendered at the bottom of receipts.
- Number-input spinner controls are disabled globally so all numeric entry is manual-typing first.
- Removed fake/testing adapter controls and QR/legal footer controls from admin settings to keep production print behavior focused on real device flow.
- Receipt preview now falls back to sale/items-derived totals when a persisted `receipt_payload` is incomplete, preventing zero-value subtotal/total previews.

## Pre-Order Workflow

Three-role order lifecycle:

- Cashier creates pre-orders with mixed items: existing product variants and ad-hoc custom items.
- Manager works from the preparation queue, updates progress, and marks orders ready.
- Admin oversees all orders, verifies payment completion, and marks pickup completion.

Technical behavior:

- API endpoints: `GET /api/orders`, `POST /api/orders`, `PATCH /api/orders/:id`.
- Order items are persisted in `order_items` and linked to `customer_orders`.
- Inventory is decremented once when an order transitions to ready/prepared for product-linked items.
- Orders can be edited/deleted only within a 20-minute edit/delete safety window after creation.
- Cashier pre-order creation supports offline queue replay using idempotency keys.
- Cashier pre-order item selection auto-fills product prices, shows live total/paid/balance values, and supports product dropdown fallback from offline cached products.
- Admin and manager order oversight now include dedicated customer-note viewing actions with larger note editing/readability surfaces.
- Order performance is surfaced on admin dashboard period views (daily/weekly/monthly) from picked-up orders for revenue transparency and is included in revenue/profit rollups.
- Offline refresh session continuity preserves authenticated state when `/auth/me` cannot be reached due to offline network conditions.
- Inventory lists now hide archived products and admin inventory identifiers are formatted for readability (e.g. `INV-000123`).
- Expense visibility is role-aware: managers only see expenses they created, while admins retain full branch visibility.
- Archive lifecycle now includes pre-order history (`customer_orders` and `order_items`) in 6-month archival and export datasets.
- Staff payments flow now has stronger branch-scoped validation (`staff_profile_id`/`user_id`), standardized API error envelopes, and safer update semantics (no location reassignment on edit).

## Security and Compliance Controls

```mermaid
flowchart TB
  Request[Incoming Request]
  Auth[JWT Authentication]
  RBAC[Role Authorization]
  Rate[Rate Limiter]
  Validate[Input Validation]
  SQL[Parameterized SQL]
  Errors[Standardized Error Contract]

  Request --> Rate --> Auth --> RBAC --> Validate --> SQL --> Errors
```

### Security Controls in Place

- JWT secret length enforcement and issuer validation.
- Account lockout/backoff after repeated failed logins.
- Refresh-token rotation endpoint for stronger session lifecycle handling.
- Role-based access control on privileged routes.
- Rate limiting tiers (auth/general/strict).
- Helmet security headers and production-oriented CORS controls.
- Parameterized SQL queries to reduce injection risk.
- Password complexity validation.
- Request-scoped IDs for incident traceability.

### Security Roadmap Recommendations

- Extend structured security event logging for SIEM-friendly ingestion.
- Add automated refresh-token cleanup/retention jobs and suspicious-login alerting.
- Introduce tenant-aware session revocation controls for emergency lockout scenarios.

---


## Session and Token Lifecycle

- Access tokens are used on every API call and can expire during normal use.
- The client now keeps session credentials per browser tab using `sessionStorage` so role context does not leak across multiple open accounts.
- On `401` responses from non-auth endpoints, the client performs a single-flight refresh-token rotation (`/api/auth/refresh-token/rotate`) and retries the original request.
- If refresh fails (expired/revoked token), the app clears session state and redirects to login with `session_expired`.
- Logout revokes the current refresh token server-side and clears client session keys.

## Staff Payments Behavior

Staff payment records support two payout modes:

- `Pay Now` (`payout_mode=pay_now`): immediate payroll entry for the selected staff and payment date.
- `Pay to Month` (`payout_mode=pay_to_month`): payroll entry assigned to a target month via `payroll_month`, used for monthly settlement planning/reporting.

Additional rules:

- Frequency (`daily`, `weekly`, `monthly`) is saved per payment and used in payment summaries.
- Edit/delete is allowed only within a 20-minute safety window from record creation.
- Offline creation is queue-safe with idempotency keys to avoid duplicate replay writes.
- Staff payment creation now supports a worked-days recommendation flow (days since last payment x daily salary rate) to assist prorated payouts.

## Database Architecture

```mermaid
flowchart LR
  USERS[(users)] --> SALES[(sales)]
  USERS --> INVENTORY_BATCHES[(inventory_batches)]
  USERS --> ACTIVITY_LOG[(activity_log)]
  LOCATIONS[(locations)] --> SALES
  LOCATIONS --> INVENTORY_BATCHES
  INVENTORY_BATCHES --> BATCH_ITEMS[(batch_items)]
  INVENTORY_BATCHES --> INVENTORY_BATCHES_ARCHIVE[(inventory_batches_archive)]
  LOCATIONS --> ARCHIVE_RUNS[(archive_runs)]
```

### Data Strategy

- Core transactional tables for operational workload.
- Archive tables for historical cold-storage movement.
- Sync audit and activity logs for diagnostics and accountability.
- Performance indexes added for high-frequency filters/sorts (inventory batches, sales, notifications, archive runs).

### Migration and Setup Safety

- Transactional migration execution.
- Advisory lock during setup/migrations to avoid concurrent runners.
- Optional dev-only seed path, gated by environment variables.
- Startup auth schema guard ensures lockout columns and refresh-token table exist in partially migrated environments.

---

## API Design and Contracts

### Global Error Contract

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "requestId": "req-..."
}
```

### Offline Write Header Contract

```http
Authorization: Bearer <token>
X-Location-Id: <branch-id>
X-Idempotency-Key: <stable-operation-id>
X-Queued-Request: true
X-Queued-Created-At: <iso-timestamp>
X-Retry-Count: <retry-number>
```

### High-Value API Domains

- `/api/auth` for authentication and account operations.
- `/api/sales` for checkout and revenue records.
- `/api/inventory` for stock and batch operations.
- `/api/waste` for waste ledger queries, dashboard summaries, and manual expiry processing.
- `/api/archive` for retention policy and archive execution.
- Manual Danger-Zone archive runs now force a `cutoffAt=now` execution for the selected branch, so admins can archive currently available history immediately (while keeping scheduled retention behavior unchanged).
- `/api/sync` for offline audit status and reconciliation metadata.

---

## Performance and Scalability

```mermaid
flowchart LR
  A[Client Request] --> B[Express Route]
  B --> C[DB pool and timeouts]
  C --> D[Indexed Query]
  D --> E[Response]
  B --> F[Scheduler Path]
  F --> G[Advisory Job Lock]
  G --> C
```

### Implemented Optimizations

- Connection pool tuning and timeout controls.
- Slow query/transaction warning logs.
- List endpoint limit clamping and input validation.
- New DB indexes for common read paths.
- Advisory locks for scheduled jobs in multi-instance environments.

---

## Timezone Strategy

- Backend stores and returns timestamps in server/UTC semantics.
- Frontend display is standardized to `Africa/Addis_Ababa` for locale rendering paths.
- This ensures users across pages see consistent business-time display.

---

## Repository Structure

```text
client/                    React + Vite frontend
server/                    Express API and backend logic
  middleware/              auth, security, request context
  routes/                  API endpoints
  services/                business workflows and schedulers
  utils/                   error helpers, location helpers, etc.
database/
  schema.sql               base schema
  migrations/              incremental SQL migrations
scripts/                   setup and utility scripts
docs/                      deep architecture and contract docs
Main docs/                 primary onboarding and operational guides
```

---

## Developer Workflow

1. Configure `.env` from `.env.example`.
2. Run database setup (`npm run setup-db`).
3. Start local environment (`npm run dev`).
4. Validate changes (`npm test`, `npm run lint`, `npm run build`).
5. Follow offline contract and error contract rules for new endpoints.

---

## Testing Strategy

- Unit tests for middleware and utility critical paths.
- Offline queue behavior tests for replay and failure semantics.
- Error handler tests for envelope consistency.
- Build/lint checks for integration-level confidence.

Recommended expansion:

- Add route-level integration tests for auth/inventory/archive.
- Add API contract snapshot tests for error and pagination behavior.
- Add scheduled-job simulation tests for multi-instance scenarios.

---

## Operations and Deployment

See dedicated deployment guidance in:

- `Main docs/deployment-and-infrastructure.md`
- `docs/architecture-and-ops-playbook.md`

---

## Documentation Map

### Primary docs

- `README.md` (this file)
- `Main docs/README.md`
- `Main docs/developer-workflow-and-guardrails.md`
- `Main docs/deployment-and-infrastructure.md`
- `Main docs/offline-refresh-sync-protection.md`

### Technical references

- `docs/offline-contract.md`
- `docs/architecture-and-ops-playbook.md`

---

## Production Readiness Checklist

- [ ] `NODE_ENV=production`
- [ ] strong `JWT_SECRET` (32+ chars)
- [ ] `DATABASE_URL` configured with SSL
- [ ] `ALLOWED_ORIGINS` configured
- [ ] migrations applied successfully
- [ ] health/readiness probes validated
- [ ] offline contract verified in client replay flows
- [ ] build/test/lint green in CI
- [ ] scheduler locks validated in multi-instance deployment

---

For implementation details and contributor guardrails, continue in `Main docs/README.md`.

## Roles and Permissions

- **Admin**: full access to business operations, account/staff lifecycle, reports, sync monitoring, and credential management.
- **Ground Manager**: inventory and batch workflows with time-window safeguards for edits/void actions.
- **Cashier**: sales execution and cashier sales history with void-window safeguards.

Detailed reference: `Main docs/roles-and-permissions.md`.
