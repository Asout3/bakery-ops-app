import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Bell, Mail, Check, X, Search, Filter } from 'lucide-react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    search: ''
  });

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}`, { is_read: true });
      setNotifications(notifications.map(notif => 
        notif.id === id ? { ...notif, is_read: true } : notif
      ));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(notifications.map(notif => ({ ...notif, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const deleteNotification = async (id) => {
    if (window.confirm('Are you sure you want to delete this notification?')) {
      try {
        await api.delete(`/notifications/${id}`);
        setNotifications(notifications.filter(notif => notif.id !== id));
      } catch (err) {
        console.error('Failed to delete notification:', err);
      }
    }
  };

  const filteredNotifications = notifications.filter(notification => {
    const matchesType = !filters.type || notification.notification_type === filters.type;
    const matchesStatus = !filters.status || 
      (filters.status === 'unread' && !notification.is_read) || 
      (filters.status === 'read' && notification.is_read);
    const matchesSearch = !filters.search || 
      notification.title.toLowerCase().includes(filters.search.toLowerCase()) ||
      notification.message.toLowerCase().includes(filters.search.toLowerCase());
    
    return matchesType && matchesStatus && matchesSearch;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="notifications-page">
      <div className="page-header">
        <h2>Notifications</h2>
        {unreadCount > 0 && (
          <button className="btn btn-outline-primary" onClick={markAllAsRead}>
            Mark All as Read ({unreadCount})
          </button>
        )}
      </div>

      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <div className="input-group">
                <span className="input-group-text"><Search size={16} /></span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search notifications..."
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                />
              </div>
            </div>
            <div className="col-md-4">
              <select
                className="form-select"
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
              >
                <option value="">All Types</option>
                <option value="inventory">Inventory</option>
                <option value="sales">Sales</option>
                <option value="system">System</option>
                <option value="payment">Payment</option>
                <option value="alert">Alert</option>
              </select>
            </div>
            <div className="col-md-4">
              <select
                className="form-select"
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
              >
                <option value="">All Status</option>
                <option value="unread">Unread</option>
                <option value="read">Read</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="notifications-list">
        {filteredNotifications.length === 0 ? (
          <div className="empty-state">
            <Bell size={48} className="text-muted" />
            <h4>No notifications</h4>
            <p>All caught up! You have no {filters.status || 'new'} notifications.</p>
          </div>
        ) : (
          filteredNotifications.map(notification => (
            <div 
              key={notification.id} 
              className={`notification-item card ${!notification.is_read ? 'unread' : ''}`}
            >
              <div className="notification-header">
                <div className="notification-title">
                  <h5>
                    {notification.title}
                    {!notification.is_read && <span className="unread-badge">NEW</span>}
                  </h5>
                  <div className="notification-meta">
                    <span className="notification-type badge badge-secondary">
                      {notification.notification_type || 'General'}
                    </span>
                    <span className="notification-date">
                      {new Date(notification.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="notification-actions">
                  {!notification.is_read && (
                    <button 
                      className="btn btn-sm btn-outline-success"
                      onClick={() => markAsRead(notification.id)}
                      title="Mark as read"
                    >
                      <Check size={14} />
                    </button>
                  )}
                  <button 
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => deleteNotification(notification.id)}
                    title="Delete"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="notification-body">
                <p>{notification.message}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}