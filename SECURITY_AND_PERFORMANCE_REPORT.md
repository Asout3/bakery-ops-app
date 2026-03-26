# 🛡️ Sentinel: Security & Performance Analysis Report

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

### 3. [MEDIUM] Weak Input Sanitization
**File:** `server/middleware/security.js`
**Function:** `sanitizeInput`
**Vulnerability:** The current sanitization only removes `<` and `>` characters and trims the string. This is insufficient to prevent many types of XSS or other injection attacks. Furthermore, this function is not consistently applied across all routes.
**Impact:** Potential for Stored XSS if malicious strings are saved to the database and then rendered in the frontend without proper escaping.
**Recommendation:** Use a robust library like `dompurify` (for HTML) or ensure consistent use of `express-validator`'s `escape()` and `trim()` functions for all user-facing inputs.

---

## ⚡ Performance Bottlenecks

### 1. [CRITICAL] N+1-like Impact on Sale Creation
**File:** `server/routes/sales.js`
**Issue:** The `processExpiredInventoryForLocation` function is called on *every single sale creation*. This function queries all expired stock batches for the location and then iterates through them, performing multiple database operations (waste record insertion, stock update, inventory movement, notifications, and activity logs) for *each* expired batch.
**Impact:** As the number of expired batches grows, sale processing will become increasingly slow, leading to a poor user experience at the POS.
**Recommendation:** Move expired inventory processing to a background worker or a scheduled job (cron). At the very least, optimize the function to perform bulk updates instead of per-batch operations.

### 2. [MEDIUM] Bulk Sync Audit Logging
**File:** `server/routes/sync.js`
**Issue:** The `/audit/bulk` route performs individual `INSERT` queries in a loop for up to 200 events.
**Impact:** High database overhead and slow response times for large sync batches.
**Recommendation:** Use a single bulk `INSERT` query with multiple value sets to significantly improve performance.

---

## 🔒 Data Integrity & Logic

### 1. [VERIFIED] FEFO (First Expired, First Out) Strategy
**File:** `server/services/stockBatchService.js`
**Finding:** The `consumeStockBatches` function correctly implements FEFO by ordering batches by `expires_at ASC NULLS LAST`. This ensures that items closer to their expiration date are sold first, reducing waste.

### 2. [LOW] Idempotency Key Trust
**File:** `server/routes/sales.js`
**Issue:** The system uses `X-Idempotency-Key` for offline safety, which is good. However, if a key is reused across different endpoints or with different payloads, the system returns the *cached* response without verifying if the new request is actually the same as the original one.
**Recommendation:** Include a hash of the request body in the idempotency check to ensure that a reused key for a different request doesn't return incorrect data.

---

## 🚀 Optimization Strategies for Speed

1. **Database Indexing:** Ensure indexes exist for all foreign keys and columns used in `WHERE` and `ORDER BY` clauses (e.g., `sale_date`, `location_id`, `expires_at`).
2. **Batch Processing:** As mentioned, use bulk inserts and updates wherever possible.
3. **Caching:** Implement server-side caching (e.g., Redis) for frequently accessed but rarely changed data, like product categories or branch settings.
4. **Connection Pooling:** Monitor and tune the `pg` pool settings based on the production load.
5. **Background Tasks:** Move non-critical side effects (like sending notifications or logging activity) to an asynchronous queue so they don't block the main request-response cycle.

---

**Report Prepared By:** Sentinel 🛡️
**Date:** 2024-05-22
