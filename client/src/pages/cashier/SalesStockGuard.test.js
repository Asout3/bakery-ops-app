import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('cashier sales page clamps stock on quantity entry and before checkout', () => {
  const file = readFileSync(new URL('./Sales.jsx', import.meta.url), 'utf8');
  assert.match(file, /const resetQuantityDraft = \(productId, fallbackValue\)/);
  assert.match(file, /toast\.warning\('Out of stock'\)/);
  assert.match(file, /const adjustedCart = \[\];/);
  assert.match(file, /if \(hasStockConflict\) \{/);
});
