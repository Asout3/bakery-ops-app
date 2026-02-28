import { useEffect, useMemo, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { enqueueOperation } from '../../utils/offlineQueue';
import './Orders.css';
import { formatCurrencyETB } from '../../utils/currency';

const PHONE_REGEX = /^\+?[0-9\s-]{9,20}$/;

const initialForm = {
  customer_name: '',
  customer_phone: '',
  order_details: '',
  pickup_at: '',
  total_amount: '',
  paid_amount: '',
  payment_method: 'cash',
};

function toLocalDateTimeValue(dateInput) {
  const value = new Date(dateInput);
  if (Number.isNaN(value.getTime())) return '';
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function getCacheKey(locationId, includeHistory) {
  return `cashier_orders_cache_${locationId || 'default'}_${includeHistory ? 'all' : 'open'}`;
}

export default function CashierOrders() {
  const { selectedLocationId } = useBranch();
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [includeHistory, setIncludeHistory] = useState(false);
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
      console.error('Failed to persist cashier orders cache');
    }
  };

  const readBestCachedOrders = (cacheKey) => {
    const exact = readCachedOrders(cacheKey);
    if (exact && exact.length) return exact;
    try {
      const locationPrefix = `cashier_orders_cache_${selectedLocationId || 'default'}_`;
      const fallbackKey = Object.keys(localStorage).find((key) => key.startsWith(locationPrefix));
      if (!fallbackKey) return null;
      return readCachedOrders(fallbackKey);
    } catch {
      return null;
    }
  };

  const fetchOrders = async () => {
    const cacheKey = getCacheKey(selectedLocationId, includeHistory);
    if (!navigator.onLine) {
      const cached = readBestCachedOrders(cacheKey);
      if (cached) {
        setOrders(cached);
        return;
      }
    }
    try {
      const response = await api.get('/orders', { params: { include_closed: includeHistory } });
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
  }, [selectedLocationId, includeHistory]);

  useEffect(() => {
    if (selectedLocationId) {
      fetchOrders();
    }
  }, [selectedLocationId, includeHistory]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const pickupTs = new Date(form.pickup_at).getTime();
      if (Number.isNaN(pickupTs) || pickupTs < Date.now()) {
        setMessage({ type: 'danger', text: 'Pickup time cannot be in the past.' });
        return;
      }

      if (!PHONE_REGEX.test(String(form.customer_phone || '').trim())) {
        setMessage({ type: 'danger', text: 'Enter a valid phone number.' });
        return;
      }

      if (String(form.order_details || '').trim().length < 5) {
        setMessage({ type: 'danger', text: 'Order details must be at least 5 characters.' });
        return;
      }

      const payload = {
        ...form,
        total_amount: Number(form.total_amount),
        paid_amount: Number(form.paid_amount),
      };

      if (payload.paid_amount > payload.total_amount) {
        setMessage({ type: 'danger', text: 'Paid amount cannot exceed total cost.' });
        return;
      }

      if (editingId) {
        await api.put(`/orders/${editingId}`, payload);
        setMessage({ type: 'success', text: 'Order updated successfully.' });
      } else {
        const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
          await api.post('/orders', payload, { headers: { 'X-Idempotency-Key': idempotencyKey } });
          setMessage({ type: 'success', text: 'Order created successfully.' });
        } catch (err) {
          if (!err.response) {
            await enqueueOperation({
              id: idempotencyKey,
              url: '/orders',
              method: 'post',
              data: payload,
              idempotencyKey,
            });
            setMessage({ type: 'warning', text: 'Offline: order queued for sync.' });
          } else {
            throw err;
          }
        }
      }
      resetForm();
      fetchOrders();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to save order') });
    } finally {
      setLoading(false);
    }
  };

  const onEdit = (order) => {
    setEditingId(order.id);
    setForm({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      order_details: order.order_details,
      pickup_at: toLocalDateTimeValue(order.pickup_at),
      total_amount: order.total_amount,
      paid_amount: order.paid_amount,
      payment_method: order.payment_method,
    });
  };

  const setStatus = async (orderId, status) => {
    try {
      await api.put(`/orders/${orderId}`, { status });
      fetchOrders();
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `order-status-${orderId}-${Date.now()}`;
        await enqueueOperation({
          id: idempotencyKey,
          url: `/orders/${orderId}`,
          method: 'put',
          data: { status },
          idempotencyKey,
        });
        setMessage({ type: 'warning', text: 'Offline: order status update queued.' });
        setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, status } : order)));
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to update status') });
      }
    }
  };

  const summary = useMemo(() => {
    const total = orders.length;
    const overdue = orders.filter((o) => o.status === 'overdue').length;
    const ready = orders.filter((o) => o.status === 'ready').length;
    return { total, overdue, ready };
  }, [orders]);

  return (
    <div className="orders-page">
      <div className="orders-header">
        <h2>Pickup Orders</h2>
        {!isOnline && <div className="alert alert-warning">You are offline. New orders and updates will be queued.</div>}
        <div className="orders-summary">
          <span className="badge badge-primary">Total: {summary.total}</span>
          <span className="badge badge-warning">Ready: {summary.ready}</span>
          <span className="badge badge-danger">Overdue: {summary.overdue}</span>
          <label className="orders-history-toggle">
            <input type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)} />
            Show order history
          </label>
        </div>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="card mb-4">
        <div className="card-header"><h4>{editingId ? 'Edit Order' : 'Create New Order'}</h4></div>
        <div className="card-body">
          <form className="order-form" onSubmit={submit}>
            <input className="input" placeholder="Customer name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required />
            <input className="input" placeholder="Phone number" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} required />
            <textarea className="input" placeholder="Custom order details" value={form.order_details} onChange={(e) => setForm({ ...form, order_details: e.target.value })} required rows={3} />
            <input className="input" type="datetime-local" min={toLocalDateTimeValue(new Date())} value={form.pickup_at} onChange={(e) => setForm({ ...form, pickup_at: e.target.value })} required />
            <input className="input" type="number" min="0.01" step="0.01" placeholder="Total cost" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} required />
            <input className="input" type="number" min="0" step="0.01" max={form.total_amount || undefined} placeholder="Paid up front" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} required />
            <select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="mobile">Mobile</option>
            </select>
            <div className="order-form-actions">
              <button className="btn btn-primary" disabled={loading}>{editingId ? 'Update Order' : 'Save Order'}</button>
              {editingId && <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel Edit</button>}
            </div>
          </form>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Customer</th><th>Pickup Time</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td>
                  <div>{order.customer_name}</div>
                  <small>{order.customer_phone}</small>
                </td>
                <td>{new Date(order.pickup_at).toLocaleString()}</td>
                <td>{formatCurrencyETB(order.total_amount)}</td>
                <td>{formatCurrencyETB(order.paid_amount)}</td>
                <td>{formatCurrencyETB(order.balance_due || 0)}</td>
                <td><span className={`badge badge-${order.status === 'overdue' ? 'danger' : order.status === 'ready' ? 'success' : 'primary'}`}>{order.status}</span></td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => onEdit(order)}>Edit</button>
                    <button className="btn btn-sm btn-success" onClick={() => setStatus(order.id, 'delivered')} disabled={order.status !== 'ready'}>Delivered</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setStatus(order.id, 'cancelled')}>Cancel</button>
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
