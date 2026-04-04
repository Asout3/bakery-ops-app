import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import api from '../api/axios';
import {
  MAX_POLL_MS,
  getBasePollDelay,
  getInitialNotificationsToAnnounce,
  getLatestNotificationTimestamp,
  getNewNotificationsToAnnounce,
  resolveNotificationTargetPath,
  resolveSeenCacheKey,
  sortNotificationsDesc,
  shouldSuppressNotificationsForPathname,
  toNotificationToken,
} from './notificationClientUtils';

const NotificationContext = createContext(null);

function readSeenNotificationTokens(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey);
    const parsed = JSON.parse(raw || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value)) : []);
  } catch {
    return new Set();
  }
}

function persistSeenNotificationTokens(cacheKey, ids) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify([...ids].slice(-500)));
  } catch {
    return;
  }
}

async function showSystemNotification(notification, targetUrl) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const payload = {
    title: notification.title || 'Bakery Operations',
    body: notification.message || '',
    tag: `bakery-notification-${notification.id}`,
    data: {
      notificationId: notification.id,
      url: targetUrl || '/admin/notifications',
    },
  };

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'SHOW_NOTIFICATION', payload });
      return;
    } catch {
      return;
    }
  }

  new Notification(payload.title, { body: payload.body, tag: payload.tag, data: payload.data });
}

export function NotificationProvider({ children }) {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');
  const pollTimeoutRef = useRef(null);
  const pollDelayRef = useRef(getBasePollDelay(typeof document !== 'undefined' ? document.visibilityState : 'visible'));
  const initializedRef = useRef(false);
  const seenNotificationTokensRef = useRef(new Set());
  const seenCacheKeyRef = useRef(resolveSeenCacheKey(user?.id, user?.role));
  const lastHandledNotificationTsRef = useRef(0);
  const fetchPromiseRef = useRef(null);
  const isNotificationSuppressed = typeof window !== 'undefined' && shouldSuppressNotificationsForPathname(window.location.pathname);
  const isNotificationSuppressedRef = useRef(isNotificationSuppressed);
  const isAuthenticatedRef = useRef(Boolean(isAuthenticated));

  useEffect(() => {
    isNotificationSuppressedRef.current = isNotificationSuppressed;
  }, [isNotificationSuppressed]);

  useEffect(() => {
    isAuthenticatedRef.current = Boolean(isAuthenticated);
  }, [isAuthenticated]);

  useEffect(() => {
    if (isNotificationSuppressed || !isAuthenticated) {
      toast.clearAll();
    }
  }, [isAuthenticated, isNotificationSuppressed, toast]);

  const clearPollTimeout = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const openNotificationsCenter = useCallback(() => {
    const targetPath = resolveNotificationTargetPath(user?.role, null);
    window.location.assign(targetPath);
  }, [user?.role]);

  const handleIncomingNotifications = useCallback(async (list) => {
    if (isNotificationSuppressed) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const sorted = sortNotificationsDesc(list);
    const unread = sorted.filter((item) => !item.is_read).length;
    setNotifications(sorted);
    setUnreadCount(unread);

    const seenTokens = seenNotificationTokensRef.current;
    const cacheKey = seenCacheKeyRef.current;
    const latestTs = getLatestNotificationTimestamp(sorted);
    if (!initializedRef.current) {
      const initialUnread = getInitialNotificationsToAnnounce(sorted, seenTokens);
      sorted.forEach((item) => seenTokens.add(toNotificationToken(item)));
      persistSeenNotificationTokens(cacheKey, seenTokens);
      lastHandledNotificationTsRef.current = latestTs;
      initializedRef.current = true;

      for (const notification of initialUnread) {
        if (isNotificationSuppressedRef.current || !isAuthenticatedRef.current) break;
        const targetPath = resolveNotificationTargetPath(user?.role, notification);
        toast.info(notification.message, {
          title: notification.title,
          duration: 10000,
          dedupeKey: `notification:${toNotificationToken(notification)}`,
          actionLabel: user?.role === 'cashier' ? '' : 'Open',
          onAction: user?.role === 'cashier' ? undefined : openNotificationsCenter,
        });
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          await showSystemNotification(notification, targetPath);
        }
      }
      return;
    }

    const announceList = getNewNotificationsToAnnounce(sorted, seenTokens, lastHandledNotificationTsRef.current);
    if (!announceList.length) {
      if (latestTs > (lastHandledNotificationTsRef.current || 0)) {
        lastHandledNotificationTsRef.current = latestTs;
      }
      return;
    }

    announceList.forEach((item) => seenTokens.add(toNotificationToken(item)));
    persistSeenNotificationTokens(cacheKey, seenTokens);
    if (latestTs > (lastHandledNotificationTsRef.current || 0)) {
      lastHandledNotificationTsRef.current = latestTs;
    }

    for (const notification of announceList) {
      if (isNotificationSuppressedRef.current || !isAuthenticatedRef.current) break;
      const targetPath = resolveNotificationTargetPath(user?.role, notification);
      toast.info(notification.message, {
        title: notification.title,
        duration: 10000,
        dedupeKey: `notification:${toNotificationToken(notification)}`,
        actionLabel: user?.role === 'cashier' ? '' : 'Open',
        onAction: user?.role === 'cashier' ? undefined : openNotificationsCenter,
      });
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        await showSystemNotification(notification, targetPath);
      }
    }
  }, [isNotificationSuppressed, openNotificationsCenter, toast, user?.role]);

  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated || authLoading) return false;
    if (isNotificationSuppressed) {
      setNotifications([]);
      setUnreadCount(0);
      return false;
    }
    if (fetchPromiseRef.current) {
      return fetchPromiseRef.current;
    }
    if (!silent) setLoading(true);

    fetchPromiseRef.current = (async () => {
      try {
        const response = await api.get('/notifications', {
          params: { limit: 100, _ts: Date.now() },
          headers: { 'X-Skip-Auth-Redirect': 'true' },
        });
        await handleIncomingNotifications(response.data || []);
        return true;
      } catch (err) {
        if (err.response?.status === 401) {
          setNotifications([]);
          setUnreadCount(0);
          return false;
        }
        console.error('Failed to fetch notifications:', err);
        return false;
      } finally {
        fetchPromiseRef.current = null;
        if (!silent) setLoading(false);
      }
    })();

    return fetchPromiseRef.current;
  }, [authLoading, handleIncomingNotifications, isAuthenticated, isNotificationSuppressed]);

  const schedulePolling = useCallback(async ({ immediate = false } = {}) => {
    clearPollTimeout();

    if (!isAuthenticated || authLoading) {
      return;
    }
    if (isNotificationSuppressed) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const visibilityState = typeof document !== 'undefined' ? document.visibilityState : 'visible';
    const baseDelay = getBasePollDelay(visibilityState);

    if (!immediate) {
      pollTimeoutRef.current = window.setTimeout(() => {
        void schedulePolling({ immediate: true });
      }, pollDelayRef.current || baseDelay);
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      pollDelayRef.current = Math.min(MAX_POLL_MS, Math.max(baseDelay * 2, (pollDelayRef.current || baseDelay) * 2));
    } else {
      const success = await fetchNotifications({ silent: true });
      pollDelayRef.current = success ? baseDelay : Math.min(MAX_POLL_MS, Math.max(baseDelay * 2, (pollDelayRef.current || baseDelay) * 2));
    }

    pollTimeoutRef.current = window.setTimeout(() => {
      void schedulePolling({ immediate: true });
    }, pollDelayRef.current);
  }, [authLoading, clearPollTimeout, fetchNotifications, isAuthenticated, isNotificationSuppressed]);

  const markAsRead = useCallback(async (id) => {
    if (!isAuthenticated) return;
    try {
      await api.put(`/notifications/${id}`, { is_read: true });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, [isAuthenticated]);

  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }, [isAuthenticated]);

  const deleteNotification = useCallback(async (id) => {
    if (!isAuthenticated) return;
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => {
        const deleted = prev.find((n) => n.id === id);
        if (deleted && !deleted.is_read) {
          setUnreadCount((count) => Math.max(0, count - 1));
        }
        return prev.filter((n) => n.id !== id);
      });
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }, [isAuthenticated]);

  const requestSystemPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return 'unsupported';
    }

    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);

    if (nextPermission === 'granted') {
      toast.success('Browser notifications enabled. New alerts will appear even when the tab is in the background.');
    } else if (nextPermission === 'denied') {
      toast.warning('Browser notifications were denied. You can enable them later from your browser settings.');
    }

    return nextPermission;
  }, [toast]);

  useEffect(() => {
    if (!isAuthenticated || authLoading || isNotificationSuppressed) {
      setNotifications([]);
      setUnreadCount(0);
      initializedRef.current = false;
      seenNotificationTokensRef.current = new Set();
      lastHandledNotificationTsRef.current = 0;
      fetchPromiseRef.current = null;
      clearPollTimeout();
      return;
    }

    const cacheKey = resolveSeenCacheKey(user?.id, user?.role);
    seenCacheKeyRef.current = cacheKey;
    seenNotificationTokensRef.current = readSeenNotificationTokens(cacheKey);

    pollDelayRef.current = getBasePollDelay(typeof document !== 'undefined' ? document.visibilityState : 'visible');
    void schedulePolling({ immediate: true });

    const handleVisibilityChange = () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission);
      }
      if (document.visibilityState === 'visible') {
        pollDelayRef.current = getBasePollDelay('visible');
        void schedulePolling({ immediate: true });
      }
    };

    window.addEventListener('online', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearPollTimeout();
      window.removeEventListener('online', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authLoading, clearPollTimeout, isAuthenticated, isNotificationSuppressed, schedulePolling, user?.id, user?.role]);

  const refresh = useCallback(async (options = {}) => {
    const success = await fetchNotifications(options);
    if (success) {
      pollDelayRef.current = getBasePollDelay(typeof document !== 'undefined' ? document.visibilityState : 'visible');
      void schedulePolling();
    }
    return success;
  }, [fetchNotifications, schedulePolling]);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    loading,
    permission,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    requestSystemPermission,
    refresh,
  }), [deleteNotification, fetchNotifications, loading, markAllAsRead, markAsRead, notifications, permission, refresh, requestSystemPermission, unreadCount]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

export default NotificationContext;
