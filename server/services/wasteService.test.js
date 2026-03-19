import test from 'node:test';
import assert from 'node:assert/strict';
import { processExpiredInventoryForLocation } from './wasteService.js';
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
