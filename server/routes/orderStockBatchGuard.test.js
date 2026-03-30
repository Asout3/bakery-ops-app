import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('orders route consumes stock via stock batches before marking pre-order ready', () => {
  const file = readFileSync(new URL('./orders.js', import.meta.url), 'utf8');
  assert.match(file, /import \{ consumeStockBatches \} from '\.\.\/services\/stockBatchService\.js'/);
  assert.match(file, /await consumeStockBatches\(tx, \{/);
  assert.match(file, /referenceType: 'order'/);
});
