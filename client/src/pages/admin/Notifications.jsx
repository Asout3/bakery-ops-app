import { useState, useEffect } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { Bell, Check, X, Search, RefreshCw } from 'lucide-react';
import './Notifications.css';

export default function NotificationsPage() {
  const { selectedLocationId } = useBranch();
  const { user } = useAuth();
  const { notifications, fetchNotifications, markAsRead, markAllAsRead, deleteNotification, unreadCount, refresh } = useNotifications();
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    type: '',
    status: '',
    search: ''
  });

  useEffect(() => {
    fetchNotifications();
    setLoading(false);
  }, [user?.role]);

  const handleMarkAsRead = async (id) => {
    await markAsRead(id);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this notification?')) {
      await deleteNotification(id);
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

  const localUnreadCount = notifications.filter(n => !n.is_read).length;

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
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <h2>Notifications</h2>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => refresh()}>
              <RefreshCw size={16} /> Refresh
            </button>
            {localUnreadCount > 0 && (
              <button className="btn btn-outline-primary" onClick={handleMarkAllAsRead}>
                Mark All as Read ({localUnreadCount})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="notifications-summary mb-4">
        <div className="summary-chip">Total: {notifications.length}</div>
        <div className="summary-chip summary-chip-warning">Unread: {localUnreadCount}</div>
        <div className="summary-chip">Read: {notifications.length - localUnreadCount}</div>
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
                {[...new Set(notifications.map((n) => n.notification_type).filter(Boolean))].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
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
                      onClick={() => handleMarkAsRead(notification.id)}
                      title="Mark as read"
                    >
                      <Check size={14} />
                    </button>
                  )}
                  <button 
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleDelete(notification.id)}
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