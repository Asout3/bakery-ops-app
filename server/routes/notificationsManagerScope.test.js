import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('notifications route limits manager visibility to stock and pre-order notification types', () => {
  const file = readFileSync(new URL('./notifications.js', import.meta.url), 'utf8');
  assert.match(file, /MANAGER_ALLOWED_NOTIFICATION_TYPES = \['low_stock', 'out_of_stock', 'order_created', 'order_updated', 'order_deleted'\]/);
  assert.match(file, /if \(req\.user\.role === 'manager'\) \{\s*params\.push\(MANAGER_ALLOWED_NOTIFICATION_TYPES\);/s);
  assert.ok(file.includes('notification_type = ANY($${params.length}::text[])'));
});
