import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('stock alert notifications use the shared admin and manager dispatch helper', () => {
  const file = readFileSync(new URL('./stockAlertService.js', import.meta.url), 'utf8');
  assert.match(file, /import \{ insertNotificationsForRecipients \} from '\.\/notificationDispatchService\.js';/);
  assert.match(file, /await insertNotificationsForRecipients\(db, \{/);
  assert.match(file, /includeAdmins: true,/);
  assert.match(file, /includeManagers: true,/);
});
