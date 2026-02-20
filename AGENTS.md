# Bakery Operations App - Development Guidelines

This document provides guidance for AI assistants and developers working on this codebase.

## Project Overview

A role-based bakery management platform with multi-branch support, offline queue resilience, and real-time inventory tracking.

## Architecture

```
client/          # React + Vite frontend
server/          # Express.js backend
  routes/        # API route handlers
  middleware/    # Auth, security, validation
  utils/         # Helpers, errors, logger, location
database/        # PostgreSQL schema and migrations
scripts/         # Setup and utility scripts
```

## Tech Stack

- **Frontend**: React 18, Vite, React Router, Axios, Recharts, Lucide React
- **Backend**: Node.js 18+, Express, PostgreSQL (pg), JWT, bcryptjs
- **Security**: Helmet, express-rate-limit, express-validator

## Commands

```bash
# Development
npm run dev              # Start both frontend and backend
npm run server           # Start backend only
npm run client           # Start frontend only

# Production
npm run build            # Build frontend for production
npm start                # Start production server

# Database
npm run setup-db         # Initialize database schema

# Docker
npm run docker:build     # Build Docker image
npm run docker:compose   # Start with docker-compose
npm run docker:down      # Stop docker-compose services

# Testing & Quality
npm test                 # Run tests
npm run lint             # Run ESLint
```

## Environment Variables

Required environment variables (see `.env.example`):

```env
PORT=5000
NODE_ENV=production
JWT_SECRET=<min-32-chars>
DATABASE_URL=<postgresql-connection-string>
ALLOWED_ORIGINS=https://yourdomain.com
```

## Security Requirements

1. **JWT_SECRET**: Must be at least 32 characters
2. **CORS**: Configured via `ALLOWED_ORIGINS` in production
3. **Rate Limiting**: 
   - Auth endpoints: 10 requests/15min
   - General API: 100 requests/15min
4. **Password Policy**: 
   - Minimum 8 characters
   - Requires letter, number, and special character
5. **Registration**: Admin-only endpoint (requires authentication)

## API Error Response Format

All errors follow this format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "requestId": "req-timestamp"
}
```

## Database Transactions

Use `withTransaction` from `server/db.js` for operations that require atomicity:

```javascript
import { withTransaction } from '../db.js';

await withTransaction(async (tx) => {
  await tx.query('INSERT INTO ...');
  await tx.query('UPDATE ...');
});
```

## Idempotency

For offline-safe writes, include `X-Idempotency-Key` header:

```javascript
headers: {
  'X-Idempotency-Key': `unique-key-${Date.now()}`
}
```

## Branch Context

Include `X-Location-Id` header for branch-specific operations:

```javascript
headers: {
  'X-Location-Id': '123'
}
```

## Adding New Routes

1. Create route file in `server/routes/`
2. Import security middleware as needed
3. Use `asyncHandler` for error handling
4. Follow existing patterns for validation
5. Register route in `server/index.js`

## Code Style

- No comments unless absolutely necessary
- Use ES modules (`import`/`export`)
- Async/await over callbacks
- Consistent error handling with AppError classes
- SQL queries use parameterized `$1, $2` syntax

## Testing

Run tests before committing:

```bash
npm test
```

Tests are located in `server/**/*.test.js` files.

## Deployment Checklist

- [ ] Set strong `JWT_SECRET` (32+ chars)
- [ ] Configure `ALLOWED_ORIGINS`
- [ ] Set `NODE_ENV=production`
- [ ] Configure `DATABASE_URL` with SSL
- [ ] Run database migrations
- [ ] Build frontend: `npm run build`
- [ ] Start with: `npm start`
