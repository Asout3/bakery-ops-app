# Offline Sync API Contract

This document defines the contract between the offline client queue and backend APIs.

## Required Request Headers for Queued Writes

- `Authorization: Bearer <token>`
- `X-Location-Id: <branch-id>`
- `X-Idempotency-Key: <stable-operation-id>`
- `X-Queued-Request: true`
- `X-Queued-Created-At: <iso-timestamp>`
- `X-Offline-Actor-Id: <original-user-id>` (optional)
- `X-Retry-Count: <retry-number>`

## Server Behavior Requirements

1. **Idempotency**
   - For write endpoints, backend must return the same logical result for repeated `X-Idempotency-Key` values for the same user.
   - Duplicate retries must never create duplicate rows.

2. **Location Safety**
   - The effective location must come from user/location authorization, using `X-Location-Id` only as a requested target.

3. **Auditability**
   - Queued writes should preserve original actor attribution when possible (`X-Offline-Actor-Id`).

## Error Contract

All API errors must use:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "requestId": "req-..."
}
```

## Status/Conflict Semantics for Offline Queue

- `401` / `403`: Session/authorization issue. Client should mark operation `needs_review`.
- `409`: Deterministic conflict. Client should mark operation `conflict`.
- `422` or deterministic `4xx`: Validation/logic conflict. Client should mark operation `conflict`.
- `429`: Rate-limit pressure. Client should retry with backoff.
- `5xx` / network failures: Transient failures. Client should retry with exponential backoff.

## Endpoint Coverage

The following write endpoints are expected to honor idempotent offline replay semantics:

- `POST /api/sales`
- `POST /api/orders`
- `POST /api/expenses`
- `POST /api/payments`
- `POST /api/inventory/batches`


## Client Runtime Guarantees

- Queue flush execution is single-flight: only one `flushQueue` may execute at a time; overlapping calls return `skipped: true`.
- Retry timing uses exponential backoff with jitter and honors `nextRetry` scheduling.
- In development mode, service workers are intentionally unregistered; offline refresh validation must be performed against production build/preview flows.

- Only pending operations are replay candidates; `failed`, `conflict`, and `needs_review` operations require explicit admin/user action before retry.
