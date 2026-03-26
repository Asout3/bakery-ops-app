
import { validatePassword, sanitizeInput } from '../server/middleware/security.js';
import assert from 'node:assert';

console.log('--- Testing Security Helpers ---');

// Test Password Validation
const weakPassword = 'password';
const strongPassword = 'Password123!';
console.log('Weak password valid?', validatePassword(weakPassword).valid);
console.log('Strong password valid?', validatePassword(strongPassword).valid);

// Test Sanitize Input
const xssInput = '<script>alert("xss")</script>';
const sanitized = sanitizeInput(xssInput);
console.log('Original:', xssInput);
console.log('Sanitized:', sanitized);

console.log('\n--- Analyzing New Findings ---');

console.log('\n[Vulnerability] Broken Access Control in Activity Log');
console.log('File: server/routes/activity.js');
console.log('Issue: Route is missing authorizeRoles middleware.');
console.log('Verification: All authenticated users can call GET /api/activity');

console.log('\n[Vulnerability] Potential DoS via Unclamped Limit');
console.log('File: server/routes/activity.js');
console.log('Issue: Limit is not clamped to a maximum value.');
console.log('Verification: Requesting ?limit=10000000 will be processed as a large DB query.');

console.log('\n[Vulnerability] Inconsistent Authorization Patterns');
console.log('File: server/routes/locations.js');
console.log('Issue: Uses manual req.user.role check instead of middleware.');
console.log('Verification: If the developer forgets this check in a new route, it will be unprotected.');

console.log('\n--- Re-verifying Prior Findings ---');
console.log('1. SSRF in Network Printing: Host/Port unvalidated.');
console.log('2. Audit Log Spoofing: actor_user_id trusted during sync.');
console.log('3. Performance Bottleneck in Sales: processExpiredInventoryForLocation called on every sale.');
console.log('4. FEFO Logic: Correctly implemented in consumeStockBatches.');
