import { useEffect, useMemo, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { enqueueOperation } from '../../utils/offlineQueue';

const emptyItem = { product_id: '', custom_item_name: '', quantity: 1, unit_price: '' };

export default function CashierOrders() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_note: '',
    pickup_at: '',
    payment_method: 'cash',
    paid_amount: '',
    items: [{ ...emptyItem }],
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const activeProducts = useMemo(() => products.filter((p) => p.is_active !== false), [products]);

  const load = async () => {
    try {
      const [ordersRes, productsRes] = await Promise.all([api.get('/orders'), api.get('/products')]);
      setOrders(ordersRes.data || []);
      setProducts(productsRes.data || []);
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to load pre-orders.') });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateItem = (idx, key, value) => {
    setForm((prev) => ({ ...prev, items: prev.items.map((item, i) => (i === idx ? { ...item, [key]: value } : item)) }));
  };

  const addRow = () => setForm((prev) => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    const payload = {
      ...form,
      paid_amount: Number(form.paid_amount || 0),
      items: form.items
        .map((item) => ({
          product_id: item.product_id ? Number(item.product_id) : null,
          custom_item_name: item.custom_item_name,
          quantity: Number(item.quantity || 1),
          unit_price: item.unit_price === '' ? undefined : Number(item.unit_price),
        }))
        .filter((item) => item.quantity > 0 && (item.product_id || item.custom_item_name?.trim())),
    };

    if (!payload.items.length) {
      setMessage({ type: 'warning', text: 'Add at least one valid order item.' });
      setLoading(false);
      return;
    }

    try {
      await api.post('/orders', payload);
      setForm({ customer_name: '', customer_phone: '', customer_note: '', pickup_at: '', payment_method: 'cash', paid_amount: '', items: [{ ...emptyItem }] });
      setMessage({ type: 'success', text: 'Pre-order created.' });
      load();
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: '/orders', method: 'post', data: payload, idempotencyKey });
        setForm({ customer_name: '', customer_phone: '', customer_note: '', pickup_at: '', payment_method: 'cash', paid_amount: '', items: [{ ...emptyItem }] });
        setMessage({ type: 'warning', text: 'Offline: pre-order queued for sync.' });
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to create pre-order.') });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header"><h2>Pre-Orders</h2></div>
      {message && <div className={`alert alert-${message.type} mb-3`}>{message.text}</div>}

      <div className="card mb-4">
        <div className="card-header"><h4>Create Pre-Order</h4></div>
        <form className="card-body" onSubmit={submit}>
          <div className="row g-3">
            <div className="col-md-4"><label className="form-label">Customer Name *</label><input className="form-control" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required /></div>
            <div className="col-md-4"><label className="form-label">Phone *</label><input className="form-control" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} required /></div>
            <div className="col-md-4"><label className="form-label">Pickup Time</label><input type="datetime-local" className="form-control" value={form.pickup_at} onChange={(e) => setForm({ ...form, pickup_at: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label">Payment Method</label><select className="form-select" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}><option value="cash">Cash</option><option value="mobile">Mobile</option></select></div>
            <div className="col-md-4"><label className="form-label">Paid Amount</label><input type="number" step="0.01" min="0" className="form-control" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} /></div>
            <div className="col-md-12"><label className="form-label">Customer Note</label><textarea className="form-control" rows="2" value={form.customer_note} onChange={(e) => setForm({ ...form, customer_note: e.target.value })} /></div>
          </div>

          <hr />
          {form.items.map((item, idx) => (
            <div className="row g-2 mb-2" key={idx}>
              <div className="col-md-4"><select className="form-select" value={item.product_id} onChange={(e) => updateItem(idx, 'product_id', e.target.value)}><option value="">Custom item</option>{activeProducts.map((p) => <option key={p.id} value={p.id}>{p.group_name || p.name} / {p.name}</option>)}</select></div>
              <div className="col-md-4"><input className="form-control" placeholder="Custom item name" value={item.custom_item_name} onChange={(e) => updateItem(idx, 'custom_item_name', e.target.value)} disabled={!!item.product_id} /></div>
              <div className="col-md-2"><input type="number" min="1" className="form-control" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} /></div>
              <div className="col-md-2"><input type="number" min="0" step="0.01" className="form-control" placeholder="Unit price" value={item.unit_price} onChange={(e) => updateItem(idx, 'unit_price', e.target.value)} /></div>
            </div>
          ))}

          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={addRow}>+ Add Item Row</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Create Pre-Order'}</button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-header"><h4>My Orders</h4></div>
        <div className="card-body table-responsive">
          <table className="table table-hover">
            <thead><tr><th>ID</th><th>Customer</th><th>Status</th><th>Prep</th><th>Payment</th><th>Pickup</th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>{order.customer_name}<div className="text-muted small">{order.customer_phone}</div></td>
                  <td><span className="badge badge-primary">{order.status}</span></td>
                  <td>{order.prep_status} ({Number(order.prep_progress || 0)}%)</td>
                  <td><span className={`badge ${order.payment_status === 'verified' ? 'badge-success' : 'badge-warning'}`}>{order.payment_status}</span></td>
                  <td>{new Date(order.pickup_at).toLocaleString()}</td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan="6" className="text-center text-muted">No pre-orders</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
