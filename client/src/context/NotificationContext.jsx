import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import api from '../api/axios';

const NotificationContext = createContext(null);

const BASE_POLL_MS = 8000;
const MAX_POLL_MS = 45000;
const SHOWN_NOTIFICATION_CACHE_KEY = 'bakery_notification_seen_ids';

function readSeenNotificationIds() {
  try {
    const raw = localStorage.getItem(SHOWN_NOTIFICATION_CACHE_KEY);
    const parsed = JSON.parse(raw || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value)) : []);
  } catch {
    return new Set();
  }
}

function persistSeenNotificationIds(ids) {
  try {
    localStorage.setItem(SHOWN_NOTIFICATION_CACHE_KEY, JSON.stringify([...ids].slice(-250)));
  } catch {
    return;
  }
}

async function showSystemNotification(notification) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const payload = {
    title: notification.title || 'Bakery Operations',
    body: notification.message || '',
    tag: `bakery-notification-${notification.id}`,
    data: {
      notificationId: notification.id,
      url: '/admin/notifications',
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
  const pollDelayRef = useRef(BASE_POLL_MS);
  const initializedRef = useRef(false);
  const seenNotificationIdsRef = useRef(readSeenNotificationIds());

  const clearPollTimeout = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const openNotificationsCenter = useCallback(() => {
    const targetPath = user?.role === 'manager' ? '/manager/notifications' : '/admin/notifications';
    window.location.assign(targetPath);
  }, [user?.role]);

  const handleIncomingNotifications = useCallback(async (list) => {
    const sorted = [...(list || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const unread = sorted.filter((item) => !item.is_read).length;
    setNotifications(sorted);
    setUnreadCount(unread);

    const seenIds = seenNotificationIdsRef.current;
    if (!initializedRef.current) {
      sorted.forEach((item) => seenIds.add(String(item.id)));
      persistSeenNotificationIds(seenIds);
      initializedRef.current = true;
      return;
    }

    const unseen = sorted.filter((item) => !seenIds.has(String(item.id)));
    if (!unseen.length) {
      return;
    }

    unseen.forEach((item) => seenIds.add(String(item.id)));
    persistSeenNotificationIds(seenIds);

    for (const notification of unseen.reverse()) {
      toast.info(notification.message, {
        title: notification.title,
        duration: 7000,
        actionLabel: 'Open',
        onAction: openNotificationsCenter,
      });
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        await showSystemNotification(notification);
      }
    }
  }, [openNotificationsCenter, toast]);

  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated || authLoading) return false;
    if (!silent) setLoading(true);

    try {
      const response = await api.get('/notifications', { params: { limit: 100 }, headers: { 'X-Skip-Auth-Redirect': 'true' } });
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
      if (!silent) setLoading(false);
    }
  }, [authLoading, handleIncomingNotifications, isAuthenticated]);

  const schedulePolling = useCallback(async () => {
    clearPollTimeout();

    if (!isAuthenticated || authLoading) {
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      pollDelayRef.current = Math.min(MAX_POLL_MS, pollDelayRef.current * 2);
    } else {
      const success = await fetchNotifications({ silent: true });
      pollDelayRef.current = success ? BASE_POLL_MS : Math.min(MAX_POLL_MS, pollDelayRef.current * 2);
    }

    pollTimeoutRef.current = window.setTimeout(() => {
      schedulePolling();
    }, pollDelayRef.current);
  }, [authLoading, clearPollTimeout, fetchNotifications, isAuthenticated]);

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
    if (!isAuthenticated || authLoading) {
      setNotifications([]);
      setUnreadCount(0);
      initializedRef.current = false;
      clearPollTimeout();
      return;
    }

    pollDelayRef.current = BASE_POLL_MS;
    fetchNotifications();
    schedulePolling();

    const handleVisibilityChange = () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission);
      }
      if (document.visibilityState === 'visible') {
        pollDelayRef.current = BASE_POLL_MS;
        fetchNotifications({ silent: true });
        schedulePolling();
      }
    };

    window.addEventListener('online', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearPollTimeout();
      window.removeEventListener('online', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authLoading, clearPollTimeout, fetchNotifications, isAuthenticated, schedulePolling, user?.id]);

  const refresh = useCallback(async (options = {}) => {
    const success = await fetchNotifications(options);
    if (success) {
      pollDelayRef.current = BASE_POLL_MS;
      schedulePolling();
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
