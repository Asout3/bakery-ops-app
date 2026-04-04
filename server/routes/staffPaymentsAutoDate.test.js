import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('staff payments use action date on create and no longer validate payment_date input', () => {
  const file = readFileSync(new URL('./payments.js', import.meta.url), 'utf8');
  assert.match(file, /\(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'\)::date/);
  assert.doesNotMatch(file, /body\('payment_date'\)/);
});
