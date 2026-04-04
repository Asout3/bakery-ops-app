import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('payments route projects simplified payment metadata for UI cleanup', () => {
  const file = readFileSync(new URL('./payments.js', import.meta.url), 'utf8');
  assert.match(file, /'monthly' as payment_frequency/);
  assert.match(file, /'pay_now' as payout_mode/);
  assert.match(file, /NULL::text as payroll_month/);
});
