import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sale edit route uses buildBulkSaleItemsInsert helper and not undefined bulkInsertSaleItems', async () => {
  const file = await readFile(new URL('./sales.js', import.meta.url), 'utf8');
  assert.match(file, /buildBulkSaleItemsInsert\(saleId, editedSaleItems\)/);
  assert.doesNotMatch(file, /bulkInsertSaleItems\(/);
  assert.doesNotMatch(file, /VALUES \$\{placeholders\.join\(/);
});

test('sale route keeps high-sale alert recipient fallback for null location assignments', async () => {
  const file = await readFile(new URL('./sales.js', import.meta.url), 'utf8');
  assert.match(file, /'High Sale Alert'/);
  assert.match(file, /location_id = \$1 OR location_id IS NULL/);
});
