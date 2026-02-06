import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Search, Plus, Edit, Trash2, DollarSign, Calendar, User } from 'lucide-react';

export default function StaffPaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [formData, setFormData] = useState({
    user_id: '',
    location_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_type: 'salary'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [paymentsRes, locationsRes] = await Promise.all([
        api.get('/payments'),
        api.get('/locations')
      ]);
      
      setPayments(paymentsRes.data);
      setLocations(locationsRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      try {
        const paymentsRes = await api.get('/payments');
        setPayments(paymentsRes.data);
      } catch (err) {
        console.error('Failed to fetch payments:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPayment) {
        await api.put(`/payments/${editingPayment.id}`, formData);
      } else {
        await api.post('/payments', formData);
      }
      fetchData();
      setShowForm(false);
      setEditingPayment(null);
      setFormData({
        user_id: '',
        location_id: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_type: 'salary'
      });
    } catch (err) {
      console.error('Failed to save payment:', err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this payment?')) {
      try {
        await api.delete(`/payments/${id}`);
        fetchData();
      } catch (err) {
        console.error('Failed to delete payment:', err);
      }
    }
  };

  const paymentTypes = ['salary', 'bonus', 'commission', 'advance', 'other'];

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="payments-page">
      <div className="page-header">
        <h2>Staff Payments</h2>
        <button 
          className="btn btn-primary" 
          onClick={() => {
            setEditingPayment(null);
            setFormData({
              user_id: '',
              location_id: '',
              amount: '',
              payment_date: new Date().toISOString().split('T')[0],
              payment_type: 'salary'
            });
            setShowForm(true);
          }}
        >
          <Plus size={18} /> Add Payment
        </button>
      </div>

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-success text-white">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <h3>${payments.reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0).toFixed(2)}</h3>
            <p>Total Payments</p>
          </div>
        </div>
        
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-primary text-white">
            <User size={24} />
          </div>
          <div className="stat-content">
            <h3>{[...new Set(payments.map(pay => pay.user_id))].length}</h3>
            <p>Unique Staff</p>
          </div>
        </div>
        
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-info text-white">
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <h3>${payments.length > 0 ? (payments.reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0) / payments.length).toFixed(2) : '0.00'}</h3>
            <p>Avg. Payment</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Staff Member</th>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(payment => (
                  <tr key={payment.id}>
                    <td>{payment.id}</td>
                    <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                    <td>User {payment.user_id}</td>
                    <td>
                      <span className="fw-bold">
                        ${Number(payment.amount).toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-primary">
                        {payment.payment_type}
                      </span>
                    </td>
                    <td>{locations.find(l => l.id === payment.location_id)?.name || payment.location_id}</td>
                    <td>
                      <button 
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => {
                          setEditingPayment(payment);
                          setFormData({
                            user_id: payment.user_id,
                            location_id: payment.location_id,
                            amount: payment.amount,
                            payment_date: payment.payment_date,
                            payment_type: payment.payment_type
                          });
                          setShowForm(true);
                        }}
                      >
                        <Edit size={14} />
                      </button>
                      <button 
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDelete(payment.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingPayment ? 'Edit Payment' : 'Add New Payment'}</h3>
              <button className="close-btn" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="mb-3">
                <label className="form-label">Staff Member ID *</label>
                <input
                  type="number"
                  className="form-control"
                  value={formData.user_id}
                  onChange={(e) => setFormData({...formData, user_id: e.target.value})}
                  required
                />
                <small className="form-text text-muted">Enter the user ID of the staff member</small>
              </div>
              
              <div className="mb-3">
                <label className="form-label">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  required
                />
              </div>
              
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Payment Type *</label>
                  <select
                    className="form-select"
                    value={formData.payment_type}
                    onChange={(e) => setFormData({...formData, payment_type: e.target.value})}
                    required
                  >
                    {paymentTypes.map(type => (
                      <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Date *</label>
                  <input
                    type="date"
                    className="form-control"
                    value={formData.payment_date}
                    onChange={(e) => setFormData({...formData, payment_date: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <div className="mb-3">
                <label className="form-label">Location</label>
                <select
                  className="form-select"
                  value={formData.location_id}
                  onChange={(e) => setFormData({...formData, location_id: e.target.value})}
                >
                  <option value="">Select Location</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingPayment ? 'Update' : 'Add'} Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}