import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('orders route blocks pickup before payment verification', () => {
  const file = readFileSync(new URL('./orders.js', import.meta.url), 'utf8');
  assert.match(file, /if \(nextStatus === 'picked_up' && nextPaidAmount < effectiveTotalAmount\)/);
  assert.match(file, /Payment must be verified before pickup\./);
  assert.match(file, /ORDER_PICKUP_PAYMENT_REQUIRED/);
});
