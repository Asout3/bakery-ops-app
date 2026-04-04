export const ACTIVE_POLL_MS = 4000;
export const BACKGROUND_POLL_MS = 12000;
export const MAX_POLL_MS = 30000;
export const SHOWN_NOTIFICATION_CACHE_KEY_PREFIX = 'bakery_notification_seen_tokens';

export function resolveSeenCacheKey(userId, role) {
  const userPart = userId ? String(userId) : 'anonymous';
  const rolePart = role ? String(role) : 'unknown';
  return `${SHOWN_NOTIFICATION_CACHE_KEY_PREFIX}:${userPart}:${rolePart}`;
}

export function toNotificationToken(notification) {
  return `${notification?.id || 'na'}:${notification?.created_at || 'na'}`;
}

export function sortNotificationsDesc(list) {
  return [...(list || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function getLatestNotificationTimestamp(list) {
  return (list || []).reduce((max, item) => {
    const ts = new Date(item?.created_at || 0).getTime();
    return Number.isFinite(ts) ? Math.max(max, ts) : max;
  }, 0);
}

export function getInitialNotificationsToAnnounce(list, seenTokens) {
  return sortNotificationsDesc(list)
    .filter((item) => !item?.is_read && !seenTokens.has(toNotificationToken(item)))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function getNewNotificationsToAnnounce(list, seenTokens, lastHandledTs) {
  const announceMap = new Map();

  for (const item of sortNotificationsDesc(list)) {
    if (item?.is_read) continue;
    const token = toNotificationToken(item);
    const createdAt = new Date(item?.created_at || 0).getTime();
    const isNewByTime = Number.isFinite(createdAt) && createdAt > (lastHandledTs || 0);
    if (!seenTokens.has(token) || isNewByTime) {
      announceMap.set(token, item);
    }
  }

  return [...announceMap.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function resolveNotificationTargetPath(role, notification) {
  if (role === 'manager') return '/manager/notifications';
  if (role === 'cashier') {
    const type = String(notification?.notification_type || '');
    if (type.startsWith('order_')) return '/cashier/orders';
    return '/cashier/sales';
  }
  return '/admin/notifications';
}

export function getBasePollDelay(visibilityState) {
  return visibilityState === 'hidden' ? BACKGROUND_POLL_MS : ACTIVE_POLL_MS;
}

export function shouldSuppressNotificationsForPathname(pathname) {
  const normalized = String(pathname || '').trim().toLowerCase();
  return normalized === '/login' || normalized.startsWith('/login/');
}
