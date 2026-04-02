import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('shared notification dispatch exposes manager-visible operational types', () => {
  const file = readFileSync(new URL('./notificationDispatchService.js', import.meta.url), 'utf8');
  assert.match(file, /export const MANAGER_VISIBLE_NOTIFICATION_TYPES = \[/);
  assert.match(file, /'batch'/);
  assert.match(file, /'low_stock'/);
  assert.match(file, /'out_of_stock'/);
  assert.match(file, /'order_created'/);
  assert.match(file, /'order_updated'/);
  assert.match(file, /'product_created'/);
  assert.match(file, /'product_updated'/);
});

test('shared notification dispatch supports admin, branch-manager, and branch-cashier recipients', () => {
  const file = readFileSync(new URL('./notificationDispatchService.js', import.meta.url), 'utf8');
  assert.match(file, /role = 'admin'/);
  assert.match(file, /\(role = 'manager' AND location_id = \$1\)/);
  assert.match(file, /\(role = 'cashier' AND location_id = \$1\)/);
});
