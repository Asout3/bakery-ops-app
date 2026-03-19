import test from 'node:test';
import assert from 'node:assert/strict';
import { syncInventoryFromStockBatches } from './stockBatchService.js';

test('syncInventoryFromStockBatches preserves an allowed source from remaining batches', async () => {
  const calls = [];
  const db = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity')) {
        return { rows: [{ quantity: 3 }] };
      }
      if (text.includes('SELECT COALESCE(')) {
        return { rows: [{ source: 'baked' }] };
      }
      if (text.includes('INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)')) {
        return { rows: [{ product_id: 8, location_id: 2, quantity: 3, source: params[3] }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };

  const result = await syncInventoryFromStockBatches(db, 2, 8);

  assert.equal(result.source, 'baked');
  assert.equal(calls.at(-1).params[3], 'baked');
});

test('syncInventoryFromStockBatches falls back to a safe source when none is available', async () => {
  const db = {
    async query(text, params = []) {
      if (text.includes('SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity')) {
        return { rows: [{ quantity: 0 }] };
      }
      if (text.includes('SELECT COALESCE(')) {
        return { rows: [{ source: 'baked' }] };
      }
      if (text.includes('INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)')) {
        return { rows: [{ product_id: 5, location_id: 1, quantity: 0, source: params[3] }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };

  const result = await syncInventoryFromStockBatches(db, 1, 5, 'manual');

  assert.equal(result.source, 'baked');
});
