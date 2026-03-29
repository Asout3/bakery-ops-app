import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('staff-for-payments route guards missing payment_due_date column during DB migrations', async () => {
  const file = await readFile(new URL('./admin.js', import.meta.url), 'utf8');
  assert.match(file, /information_schema\.columns/);
  assert.match(file, /column_name = 'payment_due_date'/);
  assert.match(file, /\$\{hasPaymentDueDate \? 'COALESCE\(sp\.payment_due_date, 25\)' : '25'\} as payment_due_date/);
});
