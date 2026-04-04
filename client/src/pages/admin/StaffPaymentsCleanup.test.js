import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('staff payments UI removes frequency breakdown and keeps total plus current month cards', () => {
  const file = readFileSync(new URL('./StaffPayments.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(file, /FREQUENCY_OPTIONS/);
  assert.match(file, /Current Month/);
  assert.match(file, /Total Paid/);
  assert.match(file, /getReadableNote\(payment\.notes\)/);
});
