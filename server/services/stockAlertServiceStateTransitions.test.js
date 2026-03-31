import test from 'node:test';
import assert from 'node:assert/strict';
import { createLowStockNotificationIfNeeded } from './stockAlertService.js';

test('createLowStockNotificationIfNeeded emits only on state transitions (normal->low, low->out)', async () => {
  const notifications = [];
  const snapshotByProduct = new Map([[21, { product_id: 21, name: 'Croissant', group_name: 'Pastry', quantity: 3, threshold: 5 }]]);
  const lastTypeByProduct = new Map();

  const db = {
    async query(text, params = []) {
      if (text.includes('COALESCE(') && text.includes('low_stock_threshold')) {
        return { rows: [snapshotByProduct.get(Number(params[1]))] };
      }
      if (text.includes('FROM notifications') && text.includes('notification_type = ANY')) {
        const messageLike = String(params[2] || '');
        const key = `${params[0]}:${messageLike}`;
        const type = lastTypeByProduct.get(key);
        return { rows: type ? [{ notification_type: type }] : [] };
      }
      if (text.includes('INSERT INTO notifications')) {
        const key = `${params[0]}:${String(params[2]).split(' is ')[0]}%`;
        lastTypeByProduct.set(key, params[3]);
        notifications.push({ type: params[3], message: params[2] });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const low = await createLowStockNotificationIfNeeded(db, 1, 21);
  const sameLow = await createLowStockNotificationIfNeeded(db, 1, 21);
  snapshotByProduct.set(21, { product_id: 21, name: 'Croissant', group_name: 'Pastry', quantity: 0, threshold: 5 });
  const out = await createLowStockNotificationIfNeeded(db, 1, 21);
  snapshotByProduct.set(21, { product_id: 21, name: 'Croissant', group_name: 'Pastry', quantity: 8, threshold: 5 });
  const recovered = await createLowStockNotificationIfNeeded(db, 1, 21);

  assert.equal(low.triggered, true);
  assert.equal(low.nextState, 'low_stock');
  assert.equal(sameLow.triggered, false);
  assert.equal(sameLow.reason, 'unchanged_state');
  assert.equal(out.triggered, true);
  assert.equal(out.nextState, 'out_of_stock');
  assert.equal(recovered.triggered, false);
  assert.equal(recovered.reason, 'above_threshold');
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications.map((item) => item.type), ['low_stock', 'out_of_stock']);
});
