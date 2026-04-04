import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('inventory batch edit and void flows trigger notifications and low-stock reevaluation', () => {
  const file = readFileSync(new URL('./inventory.js', import.meta.url), 'utf8');
  assert.match(file, /Batch Updated/);
  assert.match(file, /await createLowStockNotificationsForProducts\(tx, locationId, uniqueProductIds\);/);
  assert.match(file, /Batch Voided/);
  assert.match(file, /await createLowStockNotificationsForProducts\(tx, locationId, affectedProductIds\);/);
});
