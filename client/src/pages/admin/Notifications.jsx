import { useState, useEffect, useMemo } from 'react';
import { useNotifications } from '../../context/NotificationContext';
import { Bell, Check, X, Search, RefreshCw, Smartphone } from 'lucide-react';
import './Notifications.css';

function formatTypeLabel(type) {
  return String(type || 'general').replace(/_/g, ' ');
}

export default function NotificationsPage() {
  const {
    notifications,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    permission,
    requestSystemPermission,
    refresh,
  } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: '', status: '', search: '' });

  useEffect(() => {
    const load = async () => {
      await fetchNotifications();
      setLoading(false);
    };
    load();
  }, [fetchNotifications]);

  const filteredNotifications = useMemo(() => notifications.filter((notification) => {
    const matchesType = !filters.type || notification.notification_type === filters.type;
    const matchesStatus = !filters.status
      || (filters.status === 'unread' && !notification.is_read)
      || (filters.status === 'read' && notification.is_read);
    const searchValue = filters.search.toLowerCase();
    const matchesSearch = !filters.search
      || notification.title.toLowerCase().includes(searchValue)
      || notification.message.toLowerCase().includes(searchValue);

    return matchesType && matchesStatus && matchesSearch;
  }).sort((left, right) => {
    if (left.is_read !== right.is_read) {
      return left.is_read ? 1 : -1;
    }
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  }), [filters, notifications]);

  const unreadCount = notifications.filter((item) => !item.is_read).length;

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
          <div>
            <h2>Notifications</h2>
            <p className="text-muted mb-0">Unread alerts stay pinned to the top and new events surface as in-app popups.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => refresh()}>
              <RefreshCw size={16} /> Refresh
            </button>
            {unreadCount > 0 && (
              <button className="btn btn-outline-primary" onClick={markAllAsRead}>
                Mark All as Read ({unreadCount})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="notifications-summary mb-4">
        <div className="summary-chip summary-chip-live">Live feed</div>
        <div className="summary-chip">Total: {notifications.length}</div>
        <div className="summary-chip summary-chip-warning">Unread: {unreadCount}</div>
        <div className="summary-chip">Read: {notifications.length - unreadCount}</div>
      </div>

      <div className="card mb-4">
        <div className="card-body d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <h5 className="mb-1">Browser alerts</h5>
            <p className="mb-0 text-muted">
              {permission === 'granted' && 'Enabled. Background notifications will appear when new events arrive.'}
              {permission === 'default' && 'Enable OS-level alerts for low stock, waste, sales, and operational events.'}
              {permission === 'denied' && 'Blocked by the browser. Re-enable notifications from browser site settings.'}
              {permission === 'unsupported' && 'This browser does not support the Notifications API.'}
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={requestSystemPermission}
            disabled={permission === 'granted' || permission === 'unsupported'}
          >
            <Smartphone size={16} />
            {permission === 'granted' ? 'Enabled' : permission === 'denied' ? 'Blocked' : 'Enable Alerts'}
          </button>
        </div>
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
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
            </div>
            <div className="col-md-4">
              <select
                className="form-select"
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              >
                <option value="">All Types</option>
                {[...new Set(notifications.map((n) => n.notification_type).filter(Boolean))].map((type) => (
                  <option key={type} value={type}>{formatTypeLabel(type)}</option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <select
                className="form-select"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
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
            <p>All caught up! You have no matching notifications.</p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
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
                      {formatTypeLabel(notification.notification_type)}
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
                      <Check size={14} /> Read
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => deleteNotification(notification.id)}
                    title="Delete"
                  >
                    <X size={14} /> Delete
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
