import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('staff-for-payments route guards missing payment_due_date column during DB migrations', async () => {
  const file = await readFile(new URL('./admin.js', import.meta.url), 'utf8');
  assert.match(file, /information_schema\.tables/);
  assert.match(file, /table_name = 'staff_profiles'/);
  assert.match(file, /information_schema\.columns/);
  assert.match(file, /column_name = 'payment_due_date'/);
  assert.match(file, /buildFallbackUsersQuery/);
  assert.match(file, /u\.role IN \('manager', 'cashier'\)/);
  assert.match(file, /\$\{hasPaymentDueDate \? 'COALESCE\(sp\.payment_due_date, 25\)' : '25'\} as payment_due_date/);
});

test('payments route accepts null-location staff/user rows during migration backfills', async () => {
  const file = await readFile(new URL('./payments.js', import.meta.url), 'utf8');
  assert.match(file, /WHERE id = \$1 AND \(location_id = \$2 OR location_id IS NULL\)/);
});
