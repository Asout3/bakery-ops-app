import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orders = readFileSync(new URL('./orders.js', import.meta.url), 'utf8');
const sales = readFileSync(new URL('./sales.js', import.meta.url), 'utf8');
const payments = readFileSync(new URL('./payments.js', import.meta.url), 'utf8');
const expenses = readFileSync(new URL('./expenses.js', import.meta.url), 'utf8');
const inventory = readFileSync(new URL('./inventory.js', import.meta.url), 'utf8');
const auth = readFileSync(new URL('./auth.js', import.meta.url), 'utf8');

test('cross-endpoint idempotency lookups are endpoint-scoped in all critical write routes', () => {
  [
    [orders, '/api/orders'],
    [sales, '/api/sales'],
    [payments, '/api/payments'],
    [expenses, '/api/expenses'],
    [inventory, '/api/inventory/batches'],
  ].forEach(([source, endpoint]) => {
    assert.match(source, /WHERE user_id = \$1 AND idempotency_key = \$2 AND endpoint = \$3/);
    assert.match(source, new RegExp(endpoint.replace('/', '\\/')));
  });
});

test('offline replay actor spoof protection requires role gate or self-actor match', () => {
  [orders, sales, payments, expenses, inventory].forEach((source) => {
    assert.match(source, /canReplayForOtherActor\s*=\s*req\.user\.role\s*===\s*'admin'\s*\|\|\s*req\.user\.role\s*===\s*'manager'/);
    assert.match(source, /requestedActorId/);
    assert.match(source, /Number\(req\.user\.id\)/);
  });
});

test('idempotent create flows use advisory transaction lock across financial and inventory writes', () => {
  [orders, sales, payments, expenses, inventory].forEach((source) => {
    assert.match(source, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  });
});

test('refresh rotation rejects inactive users and legacy refresh endpoint is deprecated', () => {
  assert.match(auth, /AUTH_USER_INACTIVE/);
  assert.match(auth, /router\.post\('\/refresh-token'/);
  assert.match(auth, /status\(410\)/);
  assert.match(auth, /AUTH_REFRESH_DEPRECATED/);
});

test('orders enforce server authoritative catalog pricing for product-backed lines', () => {
  assert.match(orders, /if \(productId\)/);
  assert.match(orders, /SELECT name, price FROM products WHERE id = \$1 LIMIT 1/);
  assert.match(orders, /unitPrice = normalizeNumber\(productResult\.rows\[0\]\.price, 0\)/);
});
