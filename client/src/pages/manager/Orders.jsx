import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { enqueueOperation } from '../../utils/offlineQueue';

export default function ManagerOrders() {
  const { selectedLocationId } = useBranch();
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const readCachedOrders = (cacheKey) => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeCachedOrders = (cacheKey, rows) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(rows));
    } catch {
      console.error('Failed to persist manager orders cache');
    }
  };

  const readBestCachedOrders = (cacheKey) => {
    const exact = readCachedOrders(cacheKey);
    if (exact && exact.length) return exact;
    try {
      const prefix = `manager_orders_cache_${selectedLocationId || 'default'}`;
      const key = Object.keys(localStorage).find((k) => k.startsWith(prefix));
      if (!key) return null;
      return readCachedOrders(key);
    } catch {
      return null;
    }
  };

  const fetchOrders = async () => {
    const cacheKey = `manager_orders_cache_${selectedLocationId || 'default'}`;
    if (!navigator.onLine) {
      const cached = readBestCachedOrders(cacheKey);
      if (cached) {
        setOrders(cached);
        return;
      }
    }
    try {
      const response = await api.get('/orders');
      const rows = response.data || [];
      setOrders(rows);
      writeCachedOrders(cacheKey, rows);
    } catch (err) {
      const cached = readBestCachedOrders(cacheKey);
      if (cached) {
        setOrders(cached);
        setMessage({ type: 'warning', text: 'Offline mode: showing cached orders.' });
        return;
      }
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to load orders') });
    }
  };

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      fetchOrders();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [selectedLocationId]);

  useEffect(() => {
    if (selectedLocationId) {
      fetchOrders();
    }
  }, [selectedLocationId]);

  const markBaked = async (id) => {
    try {
      await api.put(`/orders/${id}/baked`);
      fetchOrders();
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `order-baked-${id}-${Date.now()}`;
        await enqueueOperation({
          id: idempotencyKey,
          url: `/orders/${id}/baked`,
          method: 'put',
          data: {},
          idempotencyKey,
        });
        setMessage({ type: 'warning', text: 'Offline: baked update queued.' });
        setOrders((current) => current.map((order) => (order.id === id ? { ...order, baked_done: true, status: 'ready' } : order)));
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to mark baked') });
      }
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/orders/${id}`, { status });
      fetchOrders();
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `manager-order-status-${id}-${Date.now()}`;
        await enqueueOperation({
          id: idempotencyKey,
          url: `/orders/${id}`,
          method: 'put',
          data: { status },
          idempotencyKey,
        });
        setMessage({ type: 'warning', text: 'Offline: order status update queued.' });
        setOrders((current) => current.map((order) => (order.id === id ? { ...order, status } : order)));
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to update order') });
      }
    }
  };

  return (
    <div>
      <div className="page-header"><h2>Order Baking Queue</h2></div>
      {!isOnline && <div className="alert alert-warning">You are offline. Baking updates are queued.</div>}
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Order</th><th>Customer</th><th>Details</th><th>Pickup</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>#{order.id}</td>
                <td>{order.customer_name}<br/><small>{order.customer_phone}</small></td>
                <td>{order.order_details}</td>
                <td>{new Date(order.pickup_at).toLocaleString()}</td>
                <td>{order.status}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-success" onClick={() => markBaked(order.id)} disabled={order.baked_done}>Mark Baked</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => updateStatus(order.id, 'in_production')}>In Production</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
