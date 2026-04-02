import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('notifications route uses the shared manager-visible notification type contract', () => {
  const file = readFileSync(new URL('./notifications.js', import.meta.url), 'utf8');
  assert.match(file, /import \{ MANAGER_VISIBLE_NOTIFICATION_TYPES \} from '\.\.\/services\/notificationDispatchService\.js';/);
  assert.match(file, /const MANAGER_ALLOWED_NOTIFICATION_TYPES = MANAGER_VISIBLE_NOTIFICATION_TYPES;/);
  assert.match(file, /if \(req\.user\.role === 'manager'\) \{\s*params\.push\(MANAGER_ALLOWED_NOTIFICATION_TYPES\);/s);
  assert.ok(file.includes('notification_type = ANY($${params.length}::text[])'));
});
