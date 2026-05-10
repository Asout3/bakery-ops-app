import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('shared notification dispatch exposes manager and cashier operational type contracts', () => {
  const file = readFileSync(new URL('./notificationDispatchService.js', import.meta.url), 'utf8');
  assert.match(file, /export const MANAGER_NOTIFICATION_TYPES = \[/);
  assert.match(file, /export const CASHIER_NOTIFICATION_TYPES = \[/);
  assert.match(file, /'batch'/);
  assert.match(file, /'batch_updated'/);
  assert.match(file, /'low_stock'/);
  assert.match(file, /'out_of_stock'/);
  assert.match(file, /'order_created'/);
  assert.match(file, /'order_updated'/);
  assert.match(file, /'order_deleted'/);
});

test('shared notification dispatch applies global role rules with typed location inserts', () => {
  const file = readFileSync(new URL('./notificationDispatchService.js', import.meta.url), 'utf8');
  assert.match(file, /role = 'admin'/);
  assert.match(file, /roleShouldReceiveType\(role, notificationType\)/);
  assert.match(file, /recipientClauses\.push\(`role = 'manager'`\);/);
  assert.match(file, /recipientClauses\.push\(`role = 'cashier'`\);/);
  assert.match(file, /SELECT id, \$1::integer, \$2, \$3, \$4/);
});
