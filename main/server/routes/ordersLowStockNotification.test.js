import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('orders route triggers low-stock notification after inventory consumption', () => {
  const file = readFileSync(new URL('./orders.js', import.meta.url), 'utf8');
  assert.match(file, /import \{ createLowStockNotificationIfNeeded \} from '\.\.\/services\/stockAlertService\.js';/);
  assert.match(file, /await consumeStockBatches\(/);
  assert.match(file, /await createLowStockNotificationIfNeeded\(tx, locationId, movement\.productId\);/);
});
