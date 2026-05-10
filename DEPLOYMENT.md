# Deployment Guide

This guide documents the minimum production deployment steps for Bakery Operations.

## 1) Prerequisites

- Node.js 18+
- PostgreSQL 14+
- A strong `JWT_SECRET` (32+ chars)
- HTTPS-enabled frontend domain

## 2) Required Environment Variables

Backend (`.env` / platform secrets):

```env
PORT=5000
NODE_ENV=production
APP_ENV=production
JWT_SECRET=<min-32-chars>
DATABASE_URL=<postgresql-connection-string>
ALLOWED_ORIGINS=https://your-frontend-domain.example
```

`APP_ENV=production` is a safety override for platforms where `NODE_ENV` is not reliably set at runtime.

Frontend (`client` build env):

```env
VITE_API_URL=https://your-api-domain.example
```

## 3) Build and Start

From repository root:

```bash
npm install
cd client && npm install && cd ..
npm run setup-db
npm run build
npm start
```


## 3.1) Railway + Vercel Checklist

Use this exact setup to prevent CORS/preflight issues:

1. Railway backend variables:
   - `NODE_ENV=production`
   - `APP_ENV=production`
   - `ALLOWED_ORIGINS=https://ops-nu-gold.vercel.app` (or your real Vercel URL)
   - `JWT_SECRET` with 32+ chars
   - `DATABASE_URL` with SSL enabled
2. Vercel frontend variables:
   - `VITE_API_URL=https://bakery-ops-app-production.up.railway.app`
3. Redeploy backend first, then redeploy frontend.
4. Verify preflight works:

```bash
curl -i -X OPTIONS https://bakery-ops-app-production.up.railway.app/api/auth/login \
  -H 'Origin: https://ops-nu-gold.vercel.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expected response headers include `Access-Control-Allow-Origin` and `Access-Control-Allow-Methods`.

## 4) Database Safety Notes

- Always run `npm run setup-db` during initial environment provisioning and after deploying schema changes.
- The app includes startup guards for auth security schema (login lockout fields + refresh-token table), but this is a safety net and not a replacement for normal migrations.

## 5) Offline Refresh Readiness Checklist

Before marking a release ready:

1. Login in production build.
2. Open critical pages (orders, sales, inventory batches).
3. Disable network.
4. Refresh page and navigate between core pages.
5. Queue offline write actions.
6. Re-enable network and confirm replay (`synced` / `conflict` / `needs_review`) with no duplicate records.

## 6) Operational Checks

Run after deployment:

```bash
npm test
npm run build
curl -sSf https://your-api-domain.example/api/health
curl -sSf https://your-api-domain.example/api/ready
curl -sSf https://your-api-domain.example/api/live
```

## 7) Multi-instance Considerations

- Scheduler jobs are protected with PostgreSQL advisory locks to avoid duplicate processing.
- Keep all instances on the same database to preserve lock coordination and idempotency behavior.
