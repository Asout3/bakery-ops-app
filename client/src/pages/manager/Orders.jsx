import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';

export default function ManagerOrders() {
  const { selectedLocationId } = useBranch();
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState(null);

  const fetchOrders = async () => {
    try {
      const response = await api.get('/orders');
      setOrders(response.data || []);
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to load orders') });
    }
  };

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
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to mark baked') });
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/orders/${id}`, { status });
      fetchOrders();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to update order') });
    }
  };

  return (
    <div>
      <div className="page-header"><h2>Order Baking Queue</h2></div>
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
                    <button className="btn btn-sm btn-primary" onClick={() => updateStatus(order.id, 'ready')}>Ready</button>
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
