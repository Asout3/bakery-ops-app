import { useEffect, useMemo, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import './Orders.css';

const initialForm = {
  customer_name: '',
  customer_phone: '',
  customer_note: '',
  order_details: '',
  pickup_at: '',
  total_amount: '',
  paid_amount: '',
  payment_method: 'cash',
};

export default function CashierOrders() {
  const { selectedLocationId } = useBranch();
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [includeHistory, setIncludeHistory] = useState(false);

  const fetchOrders = async () => {
    try {
      const response = await api.get('/orders', { params: { include_closed: includeHistory } });
      setOrders(response.data || []);
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to load orders') });
    }
  };

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
      const payload = {
        ...form,
        total_amount: Number(form.total_amount),
        paid_amount: Number(form.paid_amount),
      };

      if (editingId) {
        await api.put(`/orders/${editingId}`, payload);
        setMessage({ type: 'success', text: 'Order updated successfully.' });
      } else {
        await api.post('/orders', payload);
        setMessage({ type: 'success', text: 'Order created successfully.' });
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
      customer_note: order.customer_note || '',
      order_details: order.order_details,
      pickup_at: new Date(order.pickup_at).toISOString().slice(0, 16),
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
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to update status') });
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
            <input className="input" placeholder="Optional note" value={form.customer_note} onChange={(e) => setForm({ ...form, customer_note: e.target.value })} />
            <textarea className="input" placeholder="Custom order details" value={form.order_details} onChange={(e) => setForm({ ...form, order_details: e.target.value })} required rows={3} />
            <input className="input" type="datetime-local" value={form.pickup_at} onChange={(e) => setForm({ ...form, pickup_at: e.target.value })} required />
            <input className="input" type="number" min="0.01" step="0.01" placeholder="Total cost" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} required />
            <input className="input" type="number" min="0" step="0.01" placeholder="Paid up front" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} required />
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
                <td>${Number(order.total_amount).toFixed(2)}</td>
                <td>${Number(order.paid_amount).toFixed(2)}</td>
                <td>${Number(order.balance_due || 0).toFixed(2)}</td>
                <td><span className={`badge badge-${order.status === 'overdue' ? 'danger' : order.status === 'ready' ? 'success' : 'primary'}`}>{order.status}</span></td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => onEdit(order)}>Edit</button>
                    <button className="btn btn-sm btn-warning" onClick={() => setStatus(order.id, 'confirmed')}>Confirm</button>
                    <button className="btn btn-sm btn-success" onClick={() => setStatus(order.id, 'delivered')}>Delivered</button>
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
