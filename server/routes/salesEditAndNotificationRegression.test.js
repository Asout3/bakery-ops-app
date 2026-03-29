import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sale edit route uses buildBulkSaleItemsInsert helper and not undefined bulkInsertSaleItems', async () => {
  const file = await readFile(new URL('./sales.js', import.meta.url), 'utf8');
  assert.match(file, /buildBulkSaleItemsInsert\(saleId, editedSaleItems\)/);
  assert.doesNotMatch(file, /bulkInsertSaleItems\(/);
});

test('sale create flow emits baseline sale notifications for admin\/manager users', async () => {
  const file = await readFile(new URL('./sales.js', import.meta.url), 'utf8');
  assert.match(file, /'Sale Recorded'/);
  assert.match(file, /notification_type\)\s+SELECT id, \$1, 'Sale Recorded', \$2, 'sale_created'/);
});
