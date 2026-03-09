import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState(null);

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
            <thead><tr><th>ID</th><th>Customer</th><th>Cashier</th><th>Status</th><th>Prep</th><th>Payment</th><th>Actions</th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>{order.customer_name}<div className="small text-muted">{new Date(order.pickup_at).toLocaleString()}</div></td>
                  <td>{order.cashier_name || order.cashier_id}</td>
                  <td><span className="badge badge-primary">{order.status}</span></td>
                  <td>{order.prep_status} ({Number(order.prep_progress || 0)}%)</td>
                  <td>{Number(order.paid_amount || 0).toFixed(2)} / {Number(order.total_amount || 0).toFixed(2)} <span className={`badge ms-1 ${order.payment_status === 'verified' ? 'badge-success' : 'badge-warning'}`}>{order.payment_status}</span></td>
                  <td className="d-flex gap-2">
                    {order.payment_status !== 'verified' && <button className="btn btn-sm btn-outline-primary" onClick={() => patch(order.id, { verify_payment: true })}>Verify Payment</button>}
                    {order.status !== 'picked_up' && <button className="btn btn-sm btn-success" onClick={() => patch(order.id, { status: 'picked_up' })}>Mark Picked Up</button>}
                  </td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan="7" className="text-center text-muted">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
