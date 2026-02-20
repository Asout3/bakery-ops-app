# Bakery Operations Web App

Role-based bakery operations platform with branch-aware workflows, offline-safe sales sync, and production security controls.

## System Architecture

```mermaid
flowchart TB
  subgraph Frontend[Client - React + Vite]
    UI[Role UI]
    AX[Axios Client]
    SYNC[Offline Sync Hook]
    Q[IndexedDB Queue]
  end

  subgraph Backend[API - Express]
    MW[Security/Auth Middleware]
    RT[Route Handlers]
    SV[Service Layer]
    RP[Repository Layer]
    EH[Central Error Handler]
  end

  subgraph DB[PostgreSQL]
    CORE[(users, staff_profiles, sales, inventory)]
    IDEM[(idempotency_keys)]
    AUDIT[(activity_log, notifications, kpi_events)]
  end

  UI --> AX --> MW --> RT --> SV --> RP --> DB
  AX --> EH
  UI --> SYNC --> Q --> AX
  RP --> CORE
  RP --> IDEM
  RP --> AUDIT
```

## Offline and Idempotency Flow

```mermaid
sequenceDiagram
  participant Cashier
  participant Client
  participant Queue
  participant API
  participant DB

  Cashier->>Client: Checkout
  Client->>API: POST /api/sales + X-Idempotency-Key
  alt network fails
    Client->>Queue: store op with same key
    Queue->>API: replay with same key
  end
  API->>DB: advisory lock on user+key
  API->>DB: check/insert idempotency_keys
  API-->>Client: single sale response
```

## Backend Layering

- `server/routes/` handles HTTP transport + validation only.
- `server/services/` contains business lifecycle logic.
- `server/repositories/` owns SQL and transaction persistence.
- `server/middleware/` enforces auth/security/request context.
- `server/utils/errors.js` standardizes `{ error, code, requestId }` responses.

## Security Posture

- Helmet hardening, CORS allowlist, and rate limiting.
- JWT secret strength enforced at startup.
- Request correlation ID attached per request.
- SQL uses parameterized queries.
- Idempotency for retry-safe writes.

## Database and Migrations

Schema evolution should be handled by SQL migrations under `database/migrations/`.
Runtime route handlers do not perform schema migration tasks.

## Run

```bash
npm install
cd client && npm install && cd ..
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

- Set `NODE_ENV=production`
- Set strong `JWT_SECRET` (32+ chars)
- Set `DATABASE_URL` with SSL policy
- Configure `ALLOWED_ORIGINS`
- Apply migrations before deploy
- Verify `/api/health`, `/api/ready`, `/api/live`
