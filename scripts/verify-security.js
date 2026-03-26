
import { validatePassword, sanitizeInput } from './server/middleware/security.js';
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
assert.strictEqual(sanitized, 'scriptalert("xss")/script'); // Actually the current implementation is very basic: .replace(/[<>]/g, '')

console.log('\n--- Analyzing SSRF Risk in Sales Route ---');
console.log('File: server/routes/sales.js');
console.log('Function: openNetworkPrinterSocket');
console.log('The "host" and "port" are taken directly from user input (req.body) in /network-printer/status and /network-printer/print.');
console.log('This allows an attacker to probe internal networks.');

console.log('\n--- Analyzing Audit Log Spoofing in Sync Route ---');
console.log('File: server/routes/sync.js');
console.log('Function: resolveAuditActor');
console.log('It prioritizes event.actor_user_id from the request body over req.user.id.');
console.log('This allows any authenticated user to attribute their actions to another user in the audit logs.');

console.log('\n--- Analyzing Performance in Sales Route ---');
console.log('File: server/routes/sales.js');
console.log('The function processExpiredInventoryForLocation is called on EVERY sale creation.');
console.log('This function iterates over ALL expired batches for the location and performs multiple DB operations per batch.');
console.log('This will cause sales to become slower as the history of expired items grows or when many items expire at once.');

console.log('\n--- Analyzing FEFO Logic in Stock Batch Service ---');
console.log('File: server/services/stockBatchService.js');
console.log('The query in consumeStockBatches uses: ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC');
console.log('This correctly implements FEFO (First Expired, First Out).');
