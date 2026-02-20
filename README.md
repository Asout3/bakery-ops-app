# Bakery Operations Web App

Production-focused, role-based bakery management platform with multi-branch operations, offline-safe writes, and inventory/sales/finance reporting.

## Core Capabilities

- Role-based access for admin, manager, cashier
- Branch-aware operations using `X-Location-Id`
- Idempotent writes for retry-safe operations using `X-Idempotency-Key`
- Offline queue with retry, conflict marking, and sync history
- Sales with inventory deduction, void flow, and movement ledger
- Expenses, staff payments, and branch reports
- Security middleware (Helmet, CORS policy, rate limiting, JWT)

## Architecture

```mermaid
flowchart LR
    subgraph Client[React + Vite Client]
      UI[Role-based UI]
      AX[Axios API Client]
      OQ[IndexedDB Offline Queue]
      SY[Sync Hook]
    end

    subgraph API[Express API]
      MW[Security + Auth Middleware]
      RT[Route Handlers]
      EH[Central Error Handler]
    end

    subgraph Data[PostgreSQL]
      S1[(Operational Tables)]
      S2[(Idempotency Keys)]
      S3[(Inventory Movements)]
      S4[(KPI Events)]
    end

    UI --> AX
    AX --> RT
    UI --> SY
    SY --> OQ
    SY --> AX

    RT --> MW
    RT --> EH
    RT --> S1
    RT --> S2
    RT --> S3
    RT --> S4
```

## Offline Sync Flow

```mermaid
sequenceDiagram
    participant User
    participant Client
    participant Queue as IndexedDB Queue
    participant API as Express API
    participant DB as PostgreSQL

    User->>Client: Create sale while online
    Client->>API: POST /api/sales + X-Idempotency-Key
    API->>DB: Validate + transaction
    API->>DB: Store idempotency response
    API-->>Client: Success

    User->>Client: Create sale while offline
    Client->>Queue: Enqueue operation + payload
    Client-->>User: Queued

    Client->>Client: Connectivity restored
    Client->>Queue: Read ready operations
    loop each queued op
      Client->>API: Retry with same idempotency key
      API->>DB: Replay-safe write
      API-->>Client: Success or conflict
      Client->>Queue: Remove success / mark conflict
    end
```

## Backend Structure

```text
server/
  index.js                    # app bootstrap, middleware, routes, lifecycle
  db.js                       # pool, query helper, transaction helper
  middleware/
    auth.js                   # JWT auth + role authorization
    security.js               # rate limiting, env validation, CORS
    requestContext.js         # requestId injection
  routes/                     # domain endpoints
  utils/
    errors.js                 # AppError classes, asyncHandler, central error handler
    location.js               # branch access resolver
```

## Frontend Structure

```text
client/src/
  api/axios.js                # API client + auth/location headers
  hooks/useOfflineSync.js     # sync loop + online/offline reaction
  utils/offlineQueue.js       # IndexedDB queue, retries, history, conflicts
  context/                    # auth, language, branch state
  pages/                      # role pages
  components/                 # shared UI
```

## Security Model

- JWT required for protected routes
- Password policy enforcement
- Per-environment rate limits
- CORS allow-list in production via `ALLOWED_ORIGINS`
- Helmet hardening and secure defaults
- Request ID on each API request (`X-Request-Id`) for traceability
- Consistent API errors with `{ error, code, requestId }`

## Environment Variables

See `.env.example`.

Required in production:

- `NODE_ENV=production`
- `JWT_SECRET` (32+ chars)
- `DATABASE_URL`
- `ALLOWED_ORIGINS`

Optional tuning:

- `DB_MAX_POOL_SIZE`, `DB_MIN_POOL_SIZE`
- `DB_CONNECTION_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS`
- `SSL_REJECT_UNAUTHORIZED`, `SSL_CA_CERT`

## Run

```bash
npm install
cd client && npm install && cd ..
cp .env.example .env
npm run setup-db
npm run dev
```

## Quality Gates

```bash
npm test
npm run lint
npm run build
```

## Production Checklist

- Strong JWT secret configured
- Production CORS origins set
- Database SSL policy set
- Migrations applied
- Build succeeds
- Health/readiness probes return OK
- Logs monitored for sync conflicts, slow queries, and auth/rate-limit events
