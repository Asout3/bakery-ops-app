import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_POLL_MS,
  BACKGROUND_POLL_MS,
  getBasePollDelay,
  getInitialNotificationsToAnnounce,
  getNewNotificationsToAnnounce,
  resolveNotificationTargetPath,
  shouldSuppressNotificationsForPathname,
  toNotificationToken,
} from './notificationClientUtils.js';

test('initial notification announcements exclude already seen unread notifications', () => {
  const list = [
    { id: 1, created_at: '2026-04-02T10:00:00.000Z', is_read: false },
    { id: 2, created_at: '2026-04-02T10:01:00.000Z', is_read: false },
    { id: 3, created_at: '2026-04-02T10:02:00.000Z', is_read: true },
  ];
  const seenTokens = new Set([toNotificationToken(list[0])]);

  const result = getInitialNotificationsToAnnounce(list, seenTokens);

  assert.deepEqual(result.map((item) => item.id), [2]);
});

test('new notification announcements dedupe by token and ignore read rows', () => {
  const list = [
    { id: 10, created_at: '2026-04-02T10:00:00.000Z', is_read: false },
    { id: 11, created_at: '2026-04-02T10:01:00.000Z', is_read: true },
    { id: 12, created_at: '2026-04-02T10:02:00.000Z', is_read: false },
  ];
  const seenTokens = new Set([toNotificationToken(list[0])]);

  const result = getNewNotificationsToAnnounce(list, seenTokens, Date.parse('2026-04-02T10:00:30.000Z'));

  assert.deepEqual(result.map((item) => item.id), [12]);
});

test('notification targets remain role-specific', () => {
  assert.equal(resolveNotificationTargetPath('manager', {}), '/manager/notifications');
  assert.equal(resolveNotificationTargetPath('cashier', { notification_type: 'order_created' }), '/cashier/orders');
  assert.equal(resolveNotificationTargetPath('cashier', { notification_type: 'low_stock' }), '/cashier/sales');
  assert.equal(resolveNotificationTargetPath('admin', {}), '/admin/notifications');
});

test('polling delays are faster in the foreground than the background', () => {
  assert.equal(getBasePollDelay('visible'), ACTIVE_POLL_MS);
  assert.equal(getBasePollDelay('hidden'), BACKGROUND_POLL_MS);
});

test('notification polling is suppressed on the login page', () => {
  assert.equal(shouldSuppressNotificationsForPathname('/login'), true);
  assert.equal(shouldSuppressNotificationsForPathname('/login/reset'), true);
  assert.equal(shouldSuppressNotificationsForPathname('/admin/dashboard'), false);
});
