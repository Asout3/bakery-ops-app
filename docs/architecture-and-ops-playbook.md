# Architecture and Operations Playbook

## Goals

- Keep offline-capable write flows deterministic and idempotent.
- Keep API failures debuggable with stable error envelopes and request IDs.
- Keep database schema changes safe and repeatable in production.

## Backend Boundaries

- `server/routes/*`: request validation, auth guards, transport contracts.
- `server/services/*`: business flows and cross-table operations.
- `server/db.js`: connection pooling, transaction safety, transient error annotations.
- `database/migrations/*`: all schema evolution. Do not rely on runtime schema patching for required production schema changes.

## Error Contract

All route errors should return:

```json
{
  "error": "Human readable",
  "code": "MACHINE_CODE",
  "requestId": "req-..."
}
```

Use `AppError` + `asyncHandler` for new routes and avoid ad-hoc payload shapes.

## Offline Write Contract

Queued writes must include:

- `X-Idempotency-Key`
- `X-Location-Id`
- `X-Queued-Request`
- `X-Queued-Created-At`
- `X-Retry-Count`

Use `docs/offline-contract.md` as canonical behavior semantics.

## Migration Safety Rules

- Every migration must be transactional when possible.
- Never mark failed migrations as complete.
- Use advisory locks for setup/migration jobs to prevent concurrent runners.
- Keep base schema free from production credentials/secrets.

## Performance Rules

- Every list endpoint must clamp page/limit.
- Validate date filters before executing SQL.
- Add indexes with each new query pattern (`WHERE`, `JOIN`, `ORDER BY`).
- Watch logs for `[DB SLOW QUERY]` and `[DB SLOW TRANSACTION]` lines.

## Supabase Deployment Notes

- Keep `SSL_REJECT_UNAUTHORIZED=true` in production.
- Set `SSL_CA_CERT` where required by environment.
- Tune `DB_MAX_POOL_SIZE` per instance against Supabase connection limits.
- Keep `DB_STATEMENT_TIMEOUT_MS` and `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` set to sane values.


## Time Zone Standard

- Frontend display timezone is standardized to `Africa/Addis_Ababa` for all `Date#toLocaleString`, `toLocaleDateString`, and `toLocaleTimeString` rendering paths.
- Backend stores UTC timestamps and APIs return raw timestamps; frontend is responsible for Addis Ababa presentation.

## Developer Workflow

- Run `npm test` before commit.
- Run `npm run lint` before commit.
- For schema changes, add migration file and run `npm run setup-db` on a clean environment.

