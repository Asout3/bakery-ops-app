import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';

export default function ManagerOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [selectedNoteOrder, setSelectedNoteOrder] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get('/orders');
      setOrders(response.data || []);
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to load preparation queue.') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateOrder = async (order, patch) => {
    try {
      await api.patch(`/orders/${order.id}`, patch);
      setMessage({ type: 'success', text: `Order #${order.id} updated.` });
      load();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to update order.') });
    }
  };

  if (loading) return <div className="loading-container"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header"><h2>Preparation Queue</h2></div>
      {message && <div className={`alert alert-${message.type} mb-3`}>{message.text}</div>}

      <div className="card">
        <div className="card-body table-responsive">
          <table className="table table-hover">
            <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Status</th><th>Prep Progress</th><th>Actions</th></tr></thead>
            <tbody>
              {orders.filter((o) => o.status !== 'picked_up' && o.status !== 'delivered' && o.status !== 'cancelled').map((order) => (
                <tr key={order.id}>
                  <td>{order.order_code || `ORD-${String(order.id).padStart(6, '0')}`}</td>
                  <td>{order.customer_name}<div className="text-muted small">{order.customer_phone}</div></td>
                  <td>{(order.items || []).map((item) => <div key={item.id}>{item.custom_item_name || `Product #${item.product_id}`} × {item.quantity}</div>)}</td>
                  <td><span className="badge badge-primary">{order.status}</span></td>
                  <td>
                    <input type="number" min="0" max="100" className="form-control form-control-sm" style={{ maxWidth: '110px' }} defaultValue={Number(order.prep_progress || 0)} onBlur={(e) => updateOrder(order, { prep_status: 'preparing', prep_progress: Number(e.target.value) })} />
                  </td>
                  <td className="d-flex gap-2 flex-wrap">
                    <button className="btn btn-sm btn-outline-info" onClick={() => setSelectedNoteOrder(order)}>View Note</button>
                    <button className="btn btn-sm btn-outline-primary" onClick={() => updateOrder(order, { status: 'in_production', prep_status: 'preparing' })} disabled={order.prep_status === 'ready' || order.status === 'ready'}>Start</button>
                    <button className="btn btn-sm btn-success" onClick={() => updateOrder(order, { status: 'ready', prep_status: 'ready', prep_progress: 100 })} disabled={order.prep_status === 'ready' || order.status === 'ready'}>Mark Ready</button>
                  </td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan="6" className="text-center text-muted">No orders in queue</td></tr>}
            </tbody>
          </table>
        </div>
      </div>


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
