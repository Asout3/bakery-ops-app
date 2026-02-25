import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../api/axios';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const response = await api.get('/notifications', { headers: { 'X-Skip-Auth-Redirect': 'true' } });
      const list = response.data || [];
      setNotifications(list);
      setUnreadCount(list.filter((item) => !item.is_read).length);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [isAuthenticated]);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated || authLoading) {
      setUnreadCount(0);
      return;
    }
    
    try {
      const response = await api.get('/notifications/unread/count', { headers: { 'X-Skip-Auth-Redirect': 'true' } });
      setUnreadCount(response.data?.unread_count || 0);
    } catch (err) {
      if (err.response?.status === 401) {
        setUnreadCount(0);
        return;
      }
      console.error('Failed to fetch unread count:', err);
    }
  }, [isAuthenticated, authLoading]);

  const markAsRead = useCallback(async (id) => {
    if (!isAuthenticated) return;
    
    try {
      await api.put(`/notifications/${id}`, { is_read: true });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, [isAuthenticated]);

  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }, [isAuthenticated]);

  const deleteNotification = useCallback(async (id) => {
    if (!isAuthenticated) return;
    
    try {
      await api.delete(`/notifications/${id}`);
      const deleted = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (deleted && !deleted.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }, [isAuthenticated, notifications]);

  useEffect(() => {
    if (!isAuthenticated || authLoading) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    
    fetchUnreadCount();
    
    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 10000);

    return () => clearInterval(interval);
  }, [isAuthenticated, authLoading, fetchUnreadCount]);

  const value = {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh: fetchNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

export default NotificationContext;
