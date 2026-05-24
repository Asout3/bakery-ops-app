import { useEffect, useMemo, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import api, { getErrorMessage } from '../../api/axios';
import { enqueueOperation } from '../../utils/offlineQueue';
import ReceiptPreview from '../../receipts/ReceiptPreview';
import { getReceiptConfigCache, normalizeReceiptSettings, normalizeReceiptTemplate, persistReceiptConfigCache } from '../../receipts/helpers';
import { performReceiptPrint } from '../../receipts/printService';
import { useToast } from '../../context/ToastContext';
import { buildPreOrderReceipt } from '../../receipts/orderReceipt';
import './Orders.css';

const PRODUCT_CACHE_KEY = 'orders.products.cache.v1';
const getOrdersProductCacheKeys = () => {
  const selectedLocationId = localStorage.getItem('selectedLocationId') || 'default';
  return [PRODUCT_CACHE_KEY, `cashier_products_cache_${selectedLocationId}`, 'cashier_products_cache_default'];
};
const emptyItem = { product_id: '', custom_item_name: '', quantity: 1, unit_price: '' };

export default function CashierOrders() {
  const toast = useToast();
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
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [noteViewerOrder, setNoteViewerOrder] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [receiptConfig, setReceiptConfig] = useState(() => getReceiptConfigCache() || {
    settings: normalizeReceiptSettings({}),
    activeTemplate: { id: 'default', name: 'Classic thermal', schema: normalizeReceiptTemplate({}) },
  });
  const moneyInputGuards = {
    onWheel: (e) => e.currentTarget.blur(),
    onKeyDown: (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
    },
  };

  const activeProducts = useMemo(() => products.filter((p) => p.is_active !== false), [products]);
  const productById = useMemo(() => {
    const map = new Map();
    activeProducts.forEach((product) => map.set(String(product.id), product));
    return map;
  }, [activeProducts]);
  const calculatedTotal = useMemo(() => form.items.reduce((sum, item) => {
    const qty = Math.max(1, Number(item.quantity || 1));
    const unitPrice = Number(item.unit_price || 0);
    return sum + (qty * unitPrice);
  }, 0), [form.items]);
  const calculatedPaid = Number(form.paid_amount || 0);
  const calculatedBalance = Math.max(calculatedTotal - calculatedPaid, 0);
  const receiptPreview = useMemo(() => receiptOrder ? buildPreOrderReceipt(receiptOrder, receiptConfig.activeTemplate.schema) : null, [receiptOrder, receiptConfig.activeTemplate.schema]);

  const resetForm = () => setForm({ customer_name: '', customer_phone: '', customer_note: '', pickup_at: '', payment_method: 'cash', paid_amount: '', items: [{ ...emptyItem }] });

  const fetchReceiptConfig = async () => {
    try {
      const response = await api.get('/sales/receipt-config');
      const config = {
        settings: normalizeReceiptSettings(response.data.settings || {}),
        activeTemplate: response.data.activeTemplate
          ? { ...response.data.activeTemplate, schema: normalizeReceiptTemplate(response.data.activeTemplate.schema || {}) }
          : { id: 'default', name: 'Classic thermal', schema: normalizeReceiptTemplate({}) },
      };
      setReceiptConfig(config);
      persistReceiptConfigCache(config);
    } catch {
      return null;
    }
  };

  const load = async () => {
    try {
      const [ordersRes, productsRes] = await Promise.allSettled([api.get('/orders'), api.get('/products')]);

      if (ordersRes.status === 'fulfilled') {
        setOrders(ordersRes.value.data || []);
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(ordersRes.reason, 'Failed to load pre-orders.') });
      }

      if (productsRes.status === 'fulfilled') {
        const serverProducts = productsRes.value.data || [];
        setProducts(serverProducts);
        localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(serverProducts));
      } else {
        const cachedProducts = getOrdersProductCacheKeys().map((key) => localStorage.getItem(key)).find((value) => !!value);
        if (cachedProducts) {
          setProducts(JSON.parse(cachedProducts));
          setMessage({ type: 'warning', text: 'Offline mode: using cached products for item selection.' });
        } else {
          setMessage({ type: 'danger', text: 'Could not load products and no offline cache is available.' });
        }
      }
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to load pre-orders.') });
    }
  };

  useEffect(() => {
    load();
    fetchReceiptConfig();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const updateItem = (idx, key, value) => {
    setForm((prev) => {
      const nextItems = prev.items.map((item, i) => {
        if (i !== idx) return item;
        const nextItem = { ...item, [key]: value };
        if (key === 'product_id') {
          if (value) {
            const selectedProduct = productById.get(String(value));
            nextItem.custom_item_name = '';
            nextItem.unit_price = selectedProduct?.price !== undefined ? String(selectedProduct.price) : '';
          } else {
            nextItem.product_id = '';
          }
        }
        return nextItem;
      });
      return { ...prev, items: nextItems };
    });
  };

  const removeRow = (idx) => setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  const addRow = () => setForm((prev) => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  const isFinalOrderState = (order) => ['picked_up', 'delivered', 'cancelled'].includes(order?.status);

  const canDeleteOrder = (order) => {
    const createdAt = order?.created_at ? new Date(order.created_at).getTime() : 0;
    if (!createdAt) return false;
    return nowTs - createdAt <= 20 * 60 * 1000;
  };

  const minutesLeft = (order) => {
    const createdAt = order?.created_at ? new Date(order.created_at).getTime() : 0;
    if (!createdAt) return 0;
    const remainingMs = (20 * 60 * 1000) - (nowTs - createdAt);
    return Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
  };

  const updateOrder = async () => {
    if (!editingOrder) return;
    try {
      await api.patch(`/orders/${editingOrder.id}`, {
        customer_note: editingOrder.customer_note,
        pickup_at: editingOrder.pickup_at,
        customer_name: editingOrder.customer_name,
        customer_phone: editingOrder.customer_phone,
      });
      setEditingOrder(null);
      setMessage({ type: 'success', text: 'Pre-order updated.' });
      load();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to update pre-order.') });
    }
  };

  const deleteOrder = async (orderId) => {
    if (!window.confirm('Delete this pre-order?')) return;
    try {
      await api.delete(`/orders/${orderId}`);
      setMessage({ type: 'success', text: 'Pre-order deleted.' });
      load();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to delete pre-order.') });
    }
  };

  const openReceipt = (order) => {
    setReceiptOrder(order);
  };

  const printPreOrderReceipt = async (order) => {
    const printableOrder = buildPreOrderReceipt(order, receiptConfig.activeTemplate.schema);
    setPrinting(true);
    try {
      await performReceiptPrint({
        sale: printableOrder,
        template: receiptConfig.activeTemplate.schema,
        settings: receiptConfig.settings,
        adapterMode: receiptConfig.settings.printerProfile.saleAdapter || 'browser',
        attemptType: 'test',
        printLabel: receiptConfig.settings.labels.preOrder || 'PRE-ORDER',
      });
      setMessage({ type: 'success', text: 'Pre-order receipt sent to print.' });
      toast.success('Pre-order receipt print started.');
    } catch (err) {
      const errorMessage = err.message || 'Failed to print pre-order receipt.';
      setMessage({ type: 'danger', text: errorMessage });
      toast.error(errorMessage);
    } finally {
      setPrinting(false);
    }
  };

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

    const totalFromItems = payload.items.reduce((sum, item) => sum + (Number(item.unit_price || 0) * Number(item.quantity || 0)), 0);
    if (Number(payload.paid_amount || 0) > totalFromItems) {
      setMessage({ type: 'warning', text: 'Amount paid now cannot be greater than the order total.' });
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/orders', payload);
      resetForm();
      setMessage({ type: 'success', text: 'Pre-order created.' });
      setReceiptOrder(response.data);
      load();
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: '/orders', method: 'post', data: payload, idempotencyKey });
        resetForm();
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
            <div className="col-md-4"><label className="form-label">Payment Method</label><select className="form-select" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}><option value="cash">Cash</option><option value="mobile">Mobile Banking</option><option value="telebirr">Telebirr</option></select></div>
            <div className="col-md-4"><label className="form-label">Amount Paid Now</label><input type="number" step="0.01" min="0" className="form-control" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} inputMode="decimal" {...moneyInputGuards} /></div>
            <div className="col-md-12"><label className="form-label">Customer Note</label><textarea className="form-control form-note-input" rows="4" placeholder="Special requests, allergy notes, delivery clues..." value={form.customer_note} onChange={(e) => setForm({ ...form, customer_note: e.target.value })} /></div>
          </div>

          <hr />
          <h5 className="mb-3">Order Items</h5>
          {form.items.map((item, idx) => (
            <div className="row g-2 mb-2 align-items-end" key={idx}>
              <div className="col-md-4"><label className="form-label">Product</label><select className="form-select" value={item.product_id} onChange={(e) => updateItem(idx, 'product_id', e.target.value)}><option value="">Custom item</option>{activeProducts.map((p) => <option key={p.id} value={p.id}>{p.group_name || p.name} / {p.name}</option>)}</select></div>
              <div className="col-md-3"><label className="form-label">Custom item name</label><input className="form-control" placeholder="Use for non-product items" value={item.custom_item_name} onChange={(e) => updateItem(idx, 'custom_item_name', e.target.value)} disabled={!!item.product_id} /></div>
              <div className="col-md-2"><label className="form-label">Qty</label><input type="number" min="1" className="form-control" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} /></div>
              <div className="col-md-2"><label className="form-label">Unit price</label><input type="number" min="0" step="0.01" className="form-control" placeholder="0.00" value={item.unit_price} onChange={(e) => updateItem(idx, 'unit_price', e.target.value)} inputMode="decimal" {...moneyInputGuards} /></div>
              <div className="col-md-1 d-grid"><button type="button" className="btn btn-outline-danger" onClick={() => removeRow(idx)} disabled={form.items.length === 1}>×</button></div>
            </div>
          ))}

          <div className="order-money-summary mb-3">
            <div><strong>Order Total:</strong> ETB {calculatedTotal.toFixed(2)}</div>
            <div><strong>Paid:</strong> ETB {calculatedPaid.toFixed(2)}</div>
            <div><strong>Remaining:</strong> ETB {calculatedBalance.toFixed(2)}</div>
          </div>

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
            <thead><tr><th>Order ID</th><th>Customer</th><th>Status</th><th>Prep</th><th>Payment</th><th>Pickup</th><th>Actions</th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.order_code || `ORD-${String(order.id).padStart(6, '0')}`}</td>
                  <td>{order.customer_name}<div className="text-muted small">{order.customer_phone}</div></td>
                  <td><span className="badge badge-primary">{order.status}</span></td>
                  <td>{order.prep_status} ({Number(order.prep_progress || 0)}%)</td>
                  <td>
                    ETB {Number(order.total_amount || 0).toFixed(2)} total / ETB {Number(order.paid_amount || 0).toFixed(2)} paid / ETB {Math.max(Number(order.total_amount || 0) - Number(order.paid_amount || 0), 0).toFixed(2)} remaining
                    <span className={`badge ms-1 ${order.payment_status === 'verified' ? 'badge-success' : 'badge-warning'}`}>{order.payment_status}</span>
                  </td>
                  <td>{new Date(order.pickup_at).toLocaleString()}</td>
                  <td><div className="d-flex gap-2 align-items-center flex-wrap"><button className="btn btn-sm btn-outline-secondary" onClick={() => openReceipt(order)}><FileText size={14} /> Receipt</button><button className="btn btn-sm btn-outline-primary" onClick={() => printPreOrderReceipt(order)} disabled={printing}><Printer size={14} /> Print</button><button className="btn btn-sm btn-outline-info" onClick={() => setNoteViewerOrder(order)}>View Note</button>{!isFinalOrderState(order) && <button className="btn btn-sm btn-outline-primary" onClick={() => setEditingOrder({ ...order })}>Edit</button>}{canDeleteOrder(order) && !isFinalOrderState(order) && <button className="btn btn-sm btn-outline-danger" onClick={() => deleteOrder(order.id)}>Delete</button>}{!isFinalOrderState(order) && (canDeleteOrder(order) ? <span className="badge badge-warning">Delete: {minutesLeft(order)}m left</span> : <span className="badge badge-secondary">Delete locked</span>)}</div></td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan="7" className="text-center text-muted">No pre-orders</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editingOrder && (
        <div className="modal-overlay" onClick={() => setEditingOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Edit Pre-Order</h3><button className="close-btn" onClick={() => setEditingOrder(null)}>×</button></div>
            <div className="modal-body">
              <div className="row g-2">
                <div className="col-md-6"><label className="form-label">Customer Name</label><input className="form-control" value={editingOrder.customer_name || ''} onChange={(e) => setEditingOrder((p) => ({ ...p, customer_name: e.target.value }))} /></div>
                <div className="col-md-6"><label className="form-label">Phone</label><input className="form-control" value={editingOrder.customer_phone || ''} onChange={(e) => setEditingOrder((p) => ({ ...p, customer_phone: e.target.value }))} /></div>
                <div className="col-md-6"><label className="form-label">Pickup</label><input type="datetime-local" className="form-control" value={(editingOrder.pickup_at || '').slice(0, 16)} onChange={(e) => setEditingOrder((p) => ({ ...p, pickup_at: e.target.value }))} /></div>
                <div className="col-md-12"><label className="form-label">Note</label><textarea rows="5" className="form-control form-note-input" value={editingOrder.customer_note || ''} onChange={(e) => setEditingOrder((p) => ({ ...p, customer_note: e.target.value }))} /></div>
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setEditingOrder(null)}>Cancel</button><button className="btn btn-primary" onClick={updateOrder}>Save</button></div>
          </div>
        </div>
      )}

      {noteViewerOrder && (
        <div className="modal-overlay" onClick={() => setNoteViewerOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Customer Note</h3><button className="close-btn" onClick={() => setNoteViewerOrder(null)}>×</button></div>
            <div className="modal-body"><p className="note-viewer-text">{noteViewerOrder.customer_note || 'No note added for this pre-order.'}</p></div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setNoteViewerOrder(null)}>Close</button></div>
          </div>
        </div>
      )}

      {receiptOrder && receiptPreview && (
        <div className="modal-overlay" onClick={() => setReceiptOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Pre-Order Receipt</h3><button className="close-btn" onClick={() => setReceiptOrder(null)}>×</button></div>
            <div className="modal-body">
              <div className="row g-4">
                <div className="col-lg-5">
                  <div className="mb-3">
                    <p className="mb-2"><strong>Customer:</strong> {receiptOrder.customer_name}</p>
                    <p className="mb-2"><strong>Phone:</strong> {receiptOrder.customer_phone}</p>
                    <p className="mb-2"><strong>Total:</strong> ETB {Number(receiptOrder.total_amount || 0).toFixed(2)}</p>
                    <p className="mb-2"><strong>Paid now:</strong> ETB {Number(receiptOrder.paid_amount || 0).toFixed(2)}</p>
                    <p className="mb-2"><strong>Remaining:</strong> ETB {Math.max(Number(receiptOrder.total_amount || 0) - Number(receiptOrder.paid_amount || 0), 0).toFixed(2)}</p>
                    <p className="mb-0"><strong>Pickup:</strong> {new Date(receiptOrder.pickup_at).toLocaleString()}</p>
                  </div>
                  <div className="d-flex gap-2 flex-wrap">
                    <button className="btn btn-primary" onClick={() => printPreOrderReceipt(receiptOrder)} disabled={printing}><Printer size={14} /> {printing ? 'Printing...' : 'Print Receipt'}</button>
                  </div>
                </div>
                <div className="col-lg-7 d-flex justify-content-center">
                  <ReceiptPreview sale={receiptPreview} template={receiptConfig.activeTemplate.schema} settings={receiptConfig.settings} printLabel={receiptConfig.settings.labels.preOrder || 'PRE-ORDER'} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
