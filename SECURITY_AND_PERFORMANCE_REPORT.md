# 🛡️ Sentinel: Security & Performance Analysis Report (V2)

This report provides a detailed analysis of security vulnerabilities, performance bottlenecks, and data integrity concerns identified in the Bakery Operations App.

## 🚨 Security Vulnerabilities

### 1. [HIGH] SSRF (Server-Side Request Forgery) in Network Printing
**File:** `server/routes/sales.js`
**Function:** `openNetworkPrinterSocket`
**Vulnerability:** The `/network-printer/status` and `/network-printer/print` endpoints allow users to provide an arbitrary `host` and `port`. The server then attempts to open a TCP socket to that destination.
**Impact:** An attacker could use the server as a proxy to scan internal network ports, probe internal services (like the database or other internal APIs), or even launch attacks against other systems in the local network.
**Recommendation:** Implement a whitelist of allowed printer IP addresses or restrict the `host` to a specific subnet. Validate that the `port` is a standard printing port (e.g., 9100).

### 2. [HIGH] Audit Log Identity Spoofing during Sync
**File:** `server/routes/sync.js`
**Function:** `resolveAuditActor`
**Vulnerability:** The bulk audit log sync endpoint trusts the `actor_user_id` provided in the request body from the client.
**Impact:** Any authenticated user can submit audit logs that appear to have been performed by another user (e.g., an admin). This undermines the integrity of the audit trail and makes it impossible to reliably trace malicious activity.
**Recommendation:** Always use `req.user.id` for the audit actor unless the user has administrative privileges and there is a valid reason to record a different actor.

### 3. [MEDIUM] Broken Access Control in Activity Logs
**File:** `server/routes/activity.js`
**Vulnerability:** The activity log endpoint uses `authenticateToken` but misses `authorizeRoles`.
**Impact:** Any authenticated user (including Cashiers) can view the full activity log for their location, which may include sensitive administrative actions or system events they should not have access to.
**Recommendation:** Add `authorizeRoles('admin', 'manager')` to the route.

### 4. [MEDIUM] Potential Denial of Service (DoS) via Unclamped Limits
**File:** `server/routes/activity.js`
**Vulnerability:** The `limit` parameter is parsed as an integer but not clamped to a maximum value.
**Impact:** An attacker could request a very large number of activity logs (e.g., `?limit=1000000`), causing high memory usage and database strain, potentially crashing the API or making it unresponsive.
**Recommendation:** Use a helper like `clampLimit(value, fallback, max)` to ensure limits are always within a safe range (e.g., max 500).

### 5. [LOW] Inconsistent Authorization Patterns
**File:** `server/routes/locations.js`
**Vulnerability:** Uses manual `req.user?.role !== 'admin'` checks inside the route handlers instead of the `authorizeRoles` middleware.
**Impact:** Increased risk of developer error where a new route is added without the manual check, leading to unauthorized access.
**Recommendation:** Consistently use the `authorizeRoles('admin')` middleware for all admin-only routes.

---

## ⚡ Performance Bottlenecks

### 1. [CRITICAL] N+1-like Impact on Sale Creation
**File:** `server/routes/sales.js`
**Issue:** The `processExpiredInventoryForLocation` function is called on *every single sale creation*. This function queries all expired stock batches for the location and then iterates through them, performing multiple database operations for *each* expired batch.
**Impact:** As the number of expired batches grows, sale processing will become increasingly slow.
**Recommendation:** Move expired inventory processing to a background worker or a scheduled job.

### 2. [MEDIUM] Bulk Sync Audit Logging
**File:** `server/routes/sync.js`
**Issue:** The `/audit/bulk` route performs individual `INSERT` queries in a loop for up to 200 events.
**Impact:** High database overhead and slow response times for large sync batches.
**Recommendation:** Use a single bulk `INSERT` query.

---

## 🔒 Data Integrity & Logic

### 1. [VERIFIED] FEFO (First Expired, First Out) Strategy
**File:** `server/services/stockBatchService.js`
**Finding:** The `consumeStockBatches` function correctly implements FEFO by ordering batches by `expires_at ASC NULLS LAST`.

### 2. [LOW] Idempotency Key Trust
**File:** `server/routes/sales.js`
**Issue:** Reused idempotency keys return the cached response without verifying if the request body is identical to the original one.
**Recommendation:** Include a hash of the request body in the idempotency check.

---

## 🚀 Optimization Strategies for Speed

1. **Database Indexing:** Ensure indexes exist for all foreign keys and columns used in `WHERE` and `ORDER BY` clauses.
2. **Batch Processing:** Use bulk inserts and updates wherever possible.
3. **Caching:** Implement server-side caching (e.g., Redis) for frequently accessed data.
4. **Background Tasks:** Move non-critical side effects to an asynchronous queue.

---

**Report Prepared By:** Sentinel 🛡️
**Date:** 2024-05-22
