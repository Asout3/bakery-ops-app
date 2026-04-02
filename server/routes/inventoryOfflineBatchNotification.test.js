import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('offline-synced batches do not emit batch notifications', async () => {
  const source = await readFile(new URL('./inventory.js', import.meta.url), 'utf8');
  assert.match(source, /if \(!isFromOfflineQueue\)\s*\{\s*await insertNotificationsForRecipients\(tx, \{/s);
  assert.match(source, /notificationType: 'batch'/);
  assert.match(source, /includeManagers: true/);
});
