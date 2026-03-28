import test from 'node:test';
import assert from 'node:assert/strict';
import { getExpiringStockBatchesForLocation, processExpiredInventoryForAllLocations, processExpiredInventoryForLocation } from './wasteService.js';
import { createLowStockNotificationIfNeeded } from './stockAlertService.js';

test('processExpiredInventoryForLocation moves expired stock batches into waste ledger', async () => {
  const calls = [];
  const db = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('FROM inventory_stock_batches sb') && text.includes('sb.expires_at <= NOW()')) {
        return {
          rows: [{
            stock_batch_id: 9,
            location_id: 3,
            product_id: 7,
            quantity: 4,
            expires_at: '2026-03-01T23:59:59.999Z',
            product_name: 'Chocolate Cake',
            group_name: 'Cake',
            cost: 25,
            unit: 'piece',
          }],
        };
      }
      if (text.includes('INSERT INTO waste_records')) {
        return { rows: [{ id: 14, total_loss: 100 }] };
      }
      if (text.includes('SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity')) {
        return { rows: [{ quantity: 0 }] };
      }
      if (text.includes('SELECT COALESCE(')) {
        return { rows: [{ source: 'baked' }] };
      }
      if (text.includes('INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)')) {
        return { rows: [{ product_id: 7, location_id: 3, quantity: 0, source: 'baked' }] };
      }
      if (text.includes('COALESCE(') && text.includes('low_stock_threshold')) {
        return {
          rows: [{ product_id: 7, name: 'Chocolate Cake', group_name: 'Cake', quantity: 0, threshold: 5 }],
        };
      }
      if (text.includes("notification_type = 'low_stock'")) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  const summary = await processExpiredInventoryForLocation(db, 3, 11);

  assert.equal(summary.processedCount, 1);
  assert.equal(summary.totalLoss, 100);
  assert.ok(calls.some((call) => call.text.includes('INSERT INTO waste_records')));
  assert.ok(calls.some((call) => call.text.includes('UPDATE inventory_stock_batches')));
  assert.ok(calls.some((call) => call.text.includes('INSERT INTO inventory_movements')));
  assert.ok(calls.some((call) => call.text.includes('INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)')));
});

test('createLowStockNotificationIfNeeded skips when stock is above threshold', async () => {
  const db = {
    async query(text) {
      if (text.includes('COALESCE(') && text.includes('low_stock_threshold')) {
        return { rows: [{ product_id: 4, name: 'Baguette', group_name: 'Bread', quantity: 12, threshold: 5 }] };
      }
      throw new Error('Unexpected query');
    },
  };

  const result = await createLowStockNotificationIfNeeded(db, 2, 4);

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'above_threshold');
});

test('processExpiredInventoryForLocation returns empty summary when location is missing', async () => {
  const summary = await processExpiredInventoryForLocation({ query: async () => ({ rows: [] }) }, null, 11);
  assert.deepEqual(summary, { processedCount: 0, totalLoss: 0, items: [] });
});

test('processExpiredInventoryForAllLocations processes each location with expired stock', async () => {
  const db = {
    async query(text) {
      if (text.includes('SELECT DISTINCT location_id')) {
        return { rows: [{ location_id: 2 }, { location_id: 5 }] };
      }
      if (text.includes('FROM inventory_stock_batches sb') && text.includes('WHERE sb.location_id = $1')) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const summaries = await processExpiredInventoryForAllLocations(db, 4);
  assert.equal(summaries.length, 2);
  assert.ok(summaries.every((row) => row.processedCount === 0));
});

test('getExpiringStockBatchesForLocation returns normalized expiring rows', async () => {
  const db = {
    async query(text, params) {
      assert.ok(text.includes("NOW() + INTERVAL '7 days'"));
      assert.ok(text.includes('JOIN inventory i'));
      assert.equal(params[0], 3);
      assert.equal(params[1], 20);
      return {
        rows: [{
          stock_batch_id: 91,
          product_id: 14,
          product_name: 'Vanilla Slice',
          group_name: 'Pastry',
          unit: 'piece',
          initial_quantity: '10',
          quantity_remaining: '2',
          quantity_sold: '8',
          expires_at: '2026-04-02T12:00:00.000Z',
          seconds_until_expiry: '3600',
        }],
      };
    },
  };

  const rows = await getExpiringStockBatchesForLocation(db, 3, { period: 'weekly', limit: 20 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity_sold, 8);
  assert.equal(rows[0].quantity_remaining, 2);
  assert.equal(rows[0].seconds_until_expiry, 3600);
});
