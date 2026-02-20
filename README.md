# Bakery Operations Web App

A production-ready, role-based bakery management platform for day-to-day operations across one or many branches.

## Features

- **Real-time inventory tracking** with oversell protection
- **POS sales** with offline support
- **Sale voiding** within 20-minute window with inventory restoration
- **Expenses and staff payments** management
- **Operational reports** with weekly/monthly exports
- **Branch-level controls** with role-based access
- **Offline queue/retry logic** with IndexedDB
- **Idempotent write handling** for data consistency
- **Alert rules and KPI telemetry**

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph Client["Frontend (React + Vite)"]
        UI[User Interface]
        OfflineQueue[IndexedDB Offline Queue]
        Context[Auth + Branch Context]
        SyncHook[useOfflineSync Hook]
    end
    
    subgraph Server["Backend (Node.js + Express)"]
        API[REST API Endpoints]
        Auth[JWT Authentication]
        RBAC[Role-Based Access Control]
        BranchResolver[Branch Access Resolver]
        Idempotency[Idempotency Handler]
    end
    
    subgraph Database["PostgreSQL Database"]
        Users[users, staff_profiles]
        Inventory[inventory, inventory_movements]
        Sales[sales, sale_items]
        Finance[expenses, staff_payments]
        System[idempotency_keys, kpi_events]
    end
    
    UI --> Context
    UI --> SyncHook
    SyncHook --> OfflineQueue
    SyncHook --> API
    
    API --> Auth
    API --> RBAC
    API --> BranchResolver
    API --> Idempotency
    
    Auth --> Database
    RBAC --> Database
    BranchResolver --> Database
    Idempotency --> Database
    API --> Database
```

---

## Offline Sync Architecture

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant IDB as IndexedDB
    participant API as Server API
    participant DB as Database
    
    Note over U,DB: Normal Online Flow
    U->>C: Create Sale
    C->>API: POST /sales (with idempotency key)
    API->>DB: Check idempotency key
    alt Key exists
        DB-->>API: Return cached response
    else Key not found
        API->>DB: Create sale + inventory deduction
        API->>DB: Store idempotency key
    end
    API-->>C: Sale response
    C-->>U: Success
    
    Note over U,DB: Offline Flow
    U->>C: Create Sale (offline)
    C->>IDB: Store operation in queue
    C-->>U: Queued for sync
    
    Note over U,DB: Sync on Reconnection
    C->>C: Online event triggered
    C->>IDB: Get pending operations
    loop For each operation
        C->>API: Retry with idempotency key
        API->>DB: Process with idempotency check
        API-->>C: Response
        C->>IDB: Remove from queue
    end
```

---

## Database Schema

```mermaid
erDiagram
    users ||--o{ sales : creates
    users ||--o{ expenses : records
    users ||--o{ staff_payments : receives
    users ||--o{ inventory_movements : logs
    users ||--o{ user_locations : has_access
    
    locations ||--o{ inventory : stocks
    locations ||--o{ sales : processes
    locations ||--o{ expenses : incurs
    locations ||--o{ staff_payments : pays
    
    products ||--o{ inventory : has
    products ||--o{ sale_items : includes
    products ||--o{ inventory_movements : tracks
    
    sales ||--o{ sale_items : contains
    sales ||--o{ inventory_movements : triggers
    
    inventory_batches ||--o{ batch_items : contains
    
    users {
        int id PK
        string username
        string email
        string password_hash
        string role
        int location_id FK
        boolean is_active
    }
    
    locations {
        int id PK
        string name
        string address
        boolean is_active
    }
    
    products {
        int id PK
        string name
        int category_id FK
        decimal price
        decimal cost
    }
    
    inventory {
        int id PK
        int product_id FK
        int location_id FK
        int quantity
        string source
    }
    
    sales {
        int id PK
        int location_id FK
        int cashier_id FK
        decimal total_amount
        string payment_method
        string receipt_number
        string status
        boolean is_offline
        timestamp sale_date
    }
    
    staff_profiles {
        int id PK
        string full_name
        string role_preference
        decimal monthly_salary
        int location_id FK
        int linked_user_id FK
        int payment_due_date
        boolean is_active
    }
    
    staff_payments {
        int id PK
        int user_id FK
        int staff_profile_id FK
        int location_id FK
        decimal amount
        date payment_date
        string payment_type
    }
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- npm

### Installation

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Initialize database
npm run setup-db

# Run migrations
psql "$DATABASE_URL" -f database/migrations/001_ops_hardening.sql
psql "$DATABASE_URL" -f database/migrations/002_branch_access_and_kpi.sql
psql "$DATABASE_URL" -f database/migrations/005_sales_void_support.sql

# Start development server
npm run dev
```

### Access

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Default login**: username `admin`, password `admin123`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `NODE_ENV` | Yes | `development` or `production` |
| `JWT_SECRET` | **Yes** | Min 32 characters |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `ALLOWED_ORIGINS` | Prod | Comma-separated CORS origins |

---

## Role-Based Access

```mermaid
flowchart LR
    subgraph Admin[Admin Role]
        A1[All Operations]
        A2[Branch Management]
        A3[Staff Management]
        A4[All Reports]
    end
    
    subgraph Manager[Manager Role]
        M1[Inventory Management]
        M2[Batch Operations]
        M3[Expenses]
        M4[Products CRUD]
    end
    
    subgraph Cashier[Cashier Role]
        C1[POS Sales]
        C2[Sale History]
        C3[Void Sales - 20min]
    end
    
    Admin --> Manager
    Manager --> Cashier
```

| Feature | Admin | Manager | Cashier |
|---------|-------|---------|---------|
| Dashboard | ✅ | ❌ | ❌ |
| All Branches | ✅ | ❌ | ❌ |
| Assigned Branch | ✅ | ✅ | ✅ |
| Inventory | ✅ | ✅ | ❌ |
| Sales | ✅ | ❌ | ✅ |
| Expenses | ✅ | ✅ | ❌ |
| Staff Payments | ✅ | ❌ | ❌ |
| Reports | ✅ | ❌ | ❌ |
| Products | ✅ | ✅ | ❌ |
| Sale Void | ✅ | ✅ | ✅ (20min) |

---

## Security

This application implements multiple layers of security to protect data and prevent common vulnerabilities.

### Authentication & Authorization

- **JWT-based authentication** with configurable token expiration
- **Role-based access control (RBAC)** with three roles: Admin, Manager, Cashier
- **Password hashing** using bcrypt with salt rounds of 12
- **Password validation** enforcing minimum 8 characters, letters, numbers, and special characters

### Rate Limiting

- **Authentication endpoints**: 10 requests/15min (production), 100 requests/min (development)
- **General API endpoints**: 100 requests/15min (production), 1000 requests/30s (development)
- **Strict endpoints**: 5 requests/hour (production), 50 requests/min (development)
- **Password reset**: 3 requests/hour (production), 20 requests/min (development)
- IPv6-aware key generation to prevent bypass attempts

### HTTP Security

- **Helmet.js** middleware for security headers:
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - X-XSS-Protection
  - Strict-Transport-Security (HSTS)
  - Content-Security-Policy (CSP)

### CORS Configuration

- **Development**: All origins allowed (`origin: true`)
- **Production**: Strict origin whitelist via `ALLOWED_ORIGINS` environment variable
- Credentials support enabled

### Database Security

- **Parameterized queries** (using `$1, $2, ...` syntax) to prevent SQL injection
- **SSL/TLS support** with configurable certificate verification
- **Connection pooling** with configurable limits
- **Transaction support** for atomic operations

### Input Validation

- **express-validator** for request validation
- **Input sanitization** to prevent XSS
- Strict type checking on all endpoints

### Idempotency

- **X-Idempotency-Key** header support for write operations
- Prevents duplicate submissions during network retries
- Essential for offline queue operations

### Graceful Shutdown

- Proper connection draining on server stop
- Database pool cleanup
- In-flight request completion

### Environment Validation

```mermaid
flowchart TD
    A[Server Start] --> B{NODE_ENV}
    B -->|production| C[Strict Validation]
    B -->|development| D[Relaxed Validation]
    
    C --> E{JWT_SECRET >= 32?}
    E -->|No| F[EXIT: Fatal Error]
    E -->|Yes| G{ALLOWED_ORIGINS set?}
    G -->|No| H[WARN: CORS restrictive]
    G -->|Yes| I[Full Security]
    
    D --> J[Full Access]
    J --> I
    H --> I
    F --> K[Server Crashes]
```

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Create user (admin only)
- `GET /api/auth/me` - Current user
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/refresh-token` - Refresh JWT

### Sales
- `GET /api/sales` - List sales
- `POST /api/sales` - Create sale (with offline support)
- `GET /api/sales/:id` - Sale details
- `POST /api/sales/:id/void` - Void sale (20-minute window)

### Inventory
- `GET /api/inventory` - List inventory
- `POST /api/inventory` - Create inventory record
- `PUT /api/inventory/:productId` - Update inventory
- `POST /api/inventory/batches` - Create batch (with offline support)

### Reports
- `GET /api/reports/daily` - Daily summary
- `GET /api/reports/weekly` - Weekly summary
- `GET /api/reports/weekly/export` - CSV export
- `GET /api/reports/monthly` - Monthly summary
- `GET /api/reports/branches/summary` - Multi-branch snapshot
- `GET /api/reports/kpis` - KPI metrics

---

## Offline Support

Operations that support offline queueing:

| Operation | Offline Support | Idempotency |
|-----------|----------------|-------------|
| Create Sale | ✅ | ✅ |
| Create Inventory Batch | ✅ | ✅ |
| Create Expense | ✅ | ✅ |
| Create Staff Payment | ✅ | ✅ |

The offline system features:
- **Exponential backoff** for retries
- **Conflict detection** and logging
- **Manual retry** from UI
- **Global offline indicator** with queue stats
- **Payload persistence** for conflict recovery

---

## Deployment

### Docker

```bash
# Build image
docker build -t bakery-ops-app .

# Run container
docker run -p 5000:5000 --env-file .env bakery-ops-app
```

### Docker Compose

```bash
docker-compose up -d
```

### Production Checklist

- [ ] Set strong `JWT_SECRET` (32+ characters)
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Set `NODE_ENV=production`
- [ ] Configure SSL/TLS
- [ ] Set up database backups
- [ ] Configure monitoring/logging
- [ ] Run all migrations

---

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Validate environment
npm run validate:env
```

---

## License

MIT
