import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);

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


  const canEditOrder = (order) => {
    const createdAt = order?.created_at ? new Date(order.created_at).getTime() : 0;
    if (!createdAt) return false;
    return Date.now() - createdAt <= 20 * 60 * 1000;
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

  const patch = async (orderId, payload) => {
    try {
      await api.patch(`/orders/${orderId}`, payload);
      load();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to update order.') });
    }
  };

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
                  <td>{Number(order.paid_amount || 0).toFixed(2)} / {Number(order.total_amount || 0).toFixed(2)} <span className={`badge ms-1 ${order.payment_status === 'verified' ? 'badge-success' : 'badge-warning'}`}>{order.payment_status}</span></td>
                  <td className="d-flex gap-2 flex-wrap">
                    {order.payment_status !== 'verified' && <button className="btn btn-sm btn-outline-primary" onClick={() => patch(order.id, { verify_payment: true })}>Verify Payment</button>}
                    {order.status !== 'picked_up' && <button className="btn btn-sm btn-success" onClick={() => patch(order.id, { status: 'picked_up' })}>Mark Picked Up</button>}
                    {canEditOrder(order) && <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingOrder({ ...order })}>Edit</button>}
                    {canEditOrder(order) && <button className="btn btn-sm btn-outline-danger" onClick={() => deleteOrder(order.id)}>Delete</button>}
                    {!canEditOrder(order) && <span className="badge badge-secondary">Locked</span>}
                  </td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan="7" className="text-center text-muted">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editingOrder && (
        <div className="modal-overlay" onClick={() => setEditingOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Edit Order</h3><button className="close-btn" onClick={() => setEditingOrder(null)}>×</button></div>
            <div className="modal-body"><div className="row g-2"><div className="col-md-6"><label className="form-label">Customer Name</label><input className="form-control" value={editingOrder.customer_name || ''} onChange={(e) => setEditingOrder((p) => ({ ...p, customer_name: e.target.value }))} /></div><div className="col-md-6"><label className="form-label">Phone</label><input className="form-control" value={editingOrder.customer_phone || ''} onChange={(e) => setEditingOrder((p) => ({ ...p, customer_phone: e.target.value }))} /></div><div className="col-md-6"><label className="form-label">Pickup</label><input type="datetime-local" className="form-control" value={(editingOrder.pickup_at || '').slice(0,16)} onChange={(e) => setEditingOrder((p) => ({ ...p, pickup_at: e.target.value }))} /></div><div className="col-md-12"><label className="form-label">Note</label><textarea rows="4" className="form-control" value={editingOrder.customer_note || ''} onChange={(e) => setEditingOrder((p) => ({ ...p, customer_note: e.target.value }))} /></div></div></div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setEditingOrder(null)}>Cancel</button><button className="btn btn-primary" onClick={saveOrder}>Save</button></div>
          </div>
        </div>
      )}

    </div>
  );
}
