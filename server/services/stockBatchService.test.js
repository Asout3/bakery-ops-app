import test from 'node:test';
import assert from 'node:assert/strict';
import { addStockBatch, consumeStockBatches, syncInventoryFromStockBatches } from './stockBatchService.js';

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

test('consumeStockBatches uses typed bulk update values for bigint batch ids', async () => {
  const queries = [];
  const db = {
    async query(text, params = []) {
      queries.push({ text, params });
      if (text.includes('SELECT quantity') && text.includes('FROM inventory')) {
        return { rows: [{ quantity: 2 }] };
      }
      if (text.includes('SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity')) {
        return { rows: [{ quantity: 2 }] };
      }
      if (text.includes('SELECT id, quantity_remaining, expires_at, created_at, source')) {
        return { rows: [{ id: 900719925474099n, quantity_remaining: 2, expires_at: null, created_at: new Date().toISOString(), source: 'baked' }] };
      }
      if (text.includes('UPDATE inventory_stock_batches AS b')) {
        assert.match(text, /\:\:bigint/);
        assert.match(text, /\:\:integer/);
        return { rows: [{ id: 900719925474099n, quantity_remaining: 0 }] };
      }
      if (text.includes('SELECT COALESCE(')) {
        return { rows: [{ source: 'baked' }] };
      }
      if (text.includes('INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)')) {
        return { rows: [{ quantity: 0, source: 'baked' }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };

  const result = await consumeStockBatches(db, {
    productId: 10,
    locationId: 1,
    quantity: 2,
    referenceType: 'sale',
    referenceId: 11,
  });

  assert.equal(result.consumed.length, 1);
  assert.equal(Number(result.consumed[0].quantityRemaining), 0);
  assert.ok(queries.some((entry) => entry.text.includes('UPDATE inventory_stock_batches AS b')));
});

test('addStockBatch always inserts a new batch even for the same product and expiry', async () => {
  const insertedBatchIds = [];
  const db = {
    async query(text, params = []) {
      if (text.includes('SELECT shelf_life_days')) {
        return { rows: [{ shelf_life_days: 2 }] };
      }
      if (text.includes('INSERT INTO inventory_stock_batches')) {
        const nextId = insertedBatchIds.length + 1;
        insertedBatchIds.push(nextId);
        return { rows: [{ id: nextId, product_id: params[0], location_id: params[1], quantity_remaining: params[2] }] };
      }
      if (text.includes('SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity')) {
        return { rows: [{ quantity: 10 }] };
      }
      if (text.includes('SELECT COALESCE(')) {
        return { rows: [{ source: 'baked' }] };
      }
      if (text.includes('INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)')) {
        return { rows: [{ product_id: params[0], location_id: params[1], quantity: params[2], source: params[3] }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };

  const first = await addStockBatch(db, { productId: 9, locationId: 2, quantity: 5, source: 'baked', createdAt: '2026-03-28T10:00:00.000Z' });
  const second = await addStockBatch(db, { productId: 9, locationId: 2, quantity: 5, source: 'baked', createdAt: '2026-03-28T10:30:00.000Z' });

  assert.equal(insertedBatchIds.length, 2);
  assert.notEqual(first.id, second.id);
});

test('consumeStockBatches keeps different batches separate and consumes oldest first', async () => {
  let updateCall = 0;
  const db = {
    async query(text, params = []) {
      if (text.includes('SELECT quantity') && text.includes('FROM inventory')) {
        return { rows: [{ quantity: 55 }] };
      }
      if (text.includes('SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity')) {
        return { rows: [{ quantity: 55 }] };
      }
      if (text.includes('SELECT id, quantity_remaining, expires_at, created_at, source')) {
        return {
          rows: [
            { id: 1001, quantity_remaining: 50, expires_at: '2026-04-10T23:59:59.999Z', created_at: '2026-03-28T10:00:00.000Z', source: 'baked' },
            { id: 1002, quantity_remaining: 5, expires_at: '2026-04-10T23:59:59.999Z', created_at: '2026-03-28T10:30:00.000Z', source: 'baked' },
          ],
        };
      }
      if (text.includes('UPDATE inventory_stock_batches AS b')) {
        updateCall += 1;
        if (updateCall === 1) {
          assert.equal(Number(params[1]), 1001);
          return { rows: [{ id: 1001, quantity_remaining: 0 }] };
        }
        return { rows: [{ id: 1002, quantity_remaining: 5 }] };
      }
      if (text.includes('SELECT COALESCE(')) {
        return { rows: [{ source: 'baked' }] };
      }
      if (text.includes('INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)')) {
        return { rows: [{ quantity: 5, source: 'baked' }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };

  const result = await consumeStockBatches(db, {
    productId: 9,
    locationId: 2,
    quantity: 50,
    referenceType: 'sale',
    referenceId: 999,
  });

  assert.equal(result.consumed.length, 1);
  assert.equal(Number(result.consumed[0].batchId), 1001);
  assert.equal(updateCall, 1);
});
