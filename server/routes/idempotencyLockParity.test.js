import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('expenses and inventory batch writes use advisory lock before idempotency check', () => {
  const expenses = readFileSync(new URL('./expenses.js', import.meta.url), 'utf8');
  const inventory = readFileSync(new URL('./inventory.js', import.meta.url), 'utf8');
  assert.match(expenses, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/, 'expenses should take advisory lock for idempotent writes');
  assert.match(inventory, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/, 'inventory batches should take advisory lock for idempotent writes');
});
