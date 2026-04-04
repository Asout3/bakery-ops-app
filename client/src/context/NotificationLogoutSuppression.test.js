import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('notification provider clears active toasts on login-route suppression and logout', () => {
  const file = readFileSync(new URL('./NotificationContext.jsx', import.meta.url), 'utf8');
  const utils = readFileSync(new URL('./notificationClientUtils.js', import.meta.url), 'utf8');
  assert.match(file, /if \(isNotificationSuppressed \|\| !isAuthenticated\) \{\s*toast\.clearAll\(\)/);
  assert.match(file, /if \(isNotificationSuppressedRef\.current \|\| !isAuthenticatedRef\.current\) break;/);
  assert.match(file, /lastUserTokenRef/);
  assert.match(utils, /normalized === '\/logout'/);
});
