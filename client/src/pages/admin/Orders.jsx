import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedNoteOrder, setSelectedNoteOrder] = useState(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const load = async () => {
    try {
      const response = await api.get('/orders', { params: { include_completed: true } });
      setOrders(response.data || []);
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to load orders.') });
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);


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

  const deleteOrder = async (orderId) => {
    if (!window.confirm('Delete this order?')) return;
    try {
      await api.delete(`/orders/${orderId}`);
      load();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to delete order.') });
    }
  };

  const saveOrder = async () => {
    if (!editingOrder) return;
    await patch(editingOrder.id, {
      customer_name: editingOrder.customer_name,
      customer_phone: editingOrder.customer_phone,
      customer_note: editingOrder.customer_note,
      pickup_at: editingOrder.pickup_at,
    });
    setEditingOrder(null);
  };


  const isFinalOrderState = (order) => ['picked_up', 'delivered', 'cancelled'].includes(order?.status);

  const patch = async (orderId, payload) => {
    try {
      await api.patch(`/orders/${orderId}`, payload);
      load();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to update order.') });
    }
  };

  const preOrderRows = orders.map((order) => ({
    id: order.id,
    order_code: order.order_code || `ORD-${String(order.id).padStart(6, '0')}`,
    status: order.status,
    prep_status: order.prep_status,
    prep_progress: Number(order.prep_progress || 0),
    product_details: (order.items || []).map((item) => `${item.product_name || item.custom_item_name || `#${item.product_id}`} ×${Number(item.quantity || 0)}`).join(', '),
    pickup_at: order.pickup_at,
    created_by: order.cashier_name || order.cashier_id || '-',
    created_at: order.created_at,
    updated_at: order.updated_at,
  }));

  return (
    <div>
      <div className="page-header"><h2>Orders Oversight</h2></div>
      {message && <div className={`alert alert-${message.type} mb-3`}>{message.text}</div>}
      <div className="card">
        <div className="card-body table-responsive">
          <table className="table table-hover">
            <thead><tr><th>Order ID</th><th>Customer</th><th>Cashier</th><th>Status</th><th>Prep</th><th>Payment</th><th>Actions</th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.order_code || `ORD-${String(order.id).padStart(6, '0')}`}</td>
                  <td>{order.customer_name}<div className="small text-muted">{new Date(order.pickup_at).toLocaleString()}</div></td>
                  <td>{order.cashier_name || order.cashier_id}</td>
                  <td><span className="badge badge-primary">{order.status}</span></td>
                  <td>{order.prep_status} ({Number(order.prep_progress || 0)}%)</td>
                  <td>ETB {Number(order.total_amount || 0).toFixed(2)} total / ETB {Number(order.paid_amount || 0).toFixed(2)} paid <span className={`badge ms-1 ${order.payment_status === 'verified' ? 'badge-success' : 'badge-warning'}`}>{order.payment_status}</span></td>
                  <td className="d-flex gap-2 flex-wrap">
                    {order.payment_status !== 'verified' && !isFinalOrderState(order) && <button className="btn btn-sm btn-outline-primary" onClick={() => patch(order.id, { verify_payment: true })}>Verify Payment</button>}
                    {order.status !== 'picked_up' && !isFinalOrderState(order) && <button className="btn btn-sm btn-success" onClick={() => patch(order.id, { status: 'picked_up' })}>Mark Picked Up</button>}
                    <button className="btn btn-sm btn-outline-info" onClick={() => setSelectedNoteOrder(order)}>View Note</button>
                    {!isFinalOrderState(order) && <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingOrder({ ...order })}>Edit</button>}
                    {canDeleteOrder(order) && <button className="btn btn-sm btn-outline-danger" onClick={() => deleteOrder(order.id)}>Delete</button>}
                    {canDeleteOrder(order) ? <span className="badge badge-warning">Delete: {minutesLeft(order)}m left</span> : <span className="badge badge-secondary">Delete locked</span>}
                  </td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan="7" className="text-center text-muted">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header"><h4 className="mb-0">Pre-Order Performance</h4></div>
        <div className="card-body table-responsive">
          <table className="table table-hover">
            <thead><tr><th>Order</th><th>Status</th><th>Prep</th><th>Product Details</th><th>Pickup Time</th><th>Audit Trail</th></tr></thead>
            <tbody>
              {preOrderRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.order_code}</td>
                  <td><span className="badge badge-primary">{row.status}</span></td>
                  <td>{row.prep_status} ({row.prep_progress}%)</td>
                  <td>{row.product_details || 'No items'}</td>
                  <td>{row.pickup_at ? new Date(row.pickup_at).toLocaleString() : '-'}</td>
                  <td>
                    <div className="small">Created by {row.created_by} at {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</div>
                    <div className="small">Updated at {row.updated_at ? new Date(row.updated_at).toLocaleString() : '-'}</div>
                  </td>
                </tr>
              ))}
              {!preOrderRows.length && <tr><td colSpan="6" className="text-center text-muted">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editingOrder && (
        <div className="modal-overlay" onClick={() => setEditingOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Edit Order</h3><button className="close-btn" onClick={() => setEditingOrder(null)}>×</button></div>
            <div className="modal-body"><div className="row g-2"><div className="col-md-6"><label className="form-label">Customer Name</label><input className="form-control" value={editingOrder.customer_name || ''} onChange={(e) => setEditingOrder((p) => ({ ...p, customer_name: e.target.value }))} /></div><div className="col-md-6"><label className="form-label">Phone</label><input className="form-control" value={editingOrder.customer_phone || ''} onChange={(e) => setEditingOrder((p) => ({ ...p, customer_phone: e.target.value }))} /></div><div className="col-md-6"><label className="form-label">Pickup</label><input type="datetime-local" className="form-control" value={(editingOrder.pickup_at || '').slice(0,16)} onChange={(e) => setEditingOrder((p) => ({ ...p, pickup_at: e.target.value }))} /></div><div className="col-md-12"><label className="form-label">Note</label><textarea rows="5" className="form-control form-note-input" value={editingOrder.customer_note || ''} onChange={(e) => setEditingOrder((p) => ({ ...p, customer_note: e.target.value }))} /></div></div></div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setEditingOrder(null)}>Cancel</button><button className="btn btn-primary" onClick={saveOrder}>Save</button></div>
          </div>
        </div>
      )}



      {selectedNoteOrder && (
        <div className="modal-overlay" onClick={() => setSelectedNoteOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Customer Note</h3><button className="close-btn" onClick={() => setSelectedNoteOrder(null)}>×</button></div>
            <div className="modal-body"><p className="note-viewer-text">{selectedNoteOrder.customer_note || 'No note added for this pre-order.'}</p></div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setSelectedNoteOrder(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
