import { useMemo, useState, useEffect } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Plus, Edit, Trash2, DollarSign, Calendar, User, X } from 'lucide-react';

const initialForm = {
  user_id: '',
  location_id: '',
  amount: '',
  payment_date: new Date().toISOString().split('T')[0],
  payment_type: 'salary',
  notes: '',
};

export default function StaffPaymentsPage() {
  const { selectedLocationId } = useBranch();
  const [payments, setPayments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [feedback, setFeedback] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchData();
  }, [selectedLocationId]);

  const fetchData = async () => {
    try {
      const [paymentsRes, locationsRes, staffRes] = await Promise.all([
        api.get('/payments'),
        api.get('/locations'),
        api.get('/admin/users'),
      ]);

      setPayments(paymentsRes.data || []);
      setLocations(locationsRes.data || []);
      setStaffMembers((staffRes.data || []).filter((user) => ['cashier', 'manager'].includes(user.role)));
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Failed to load payments data.' });
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingPayment(null);
    setFormData(initialForm);
    setShowForm(true);
  };

  const openEditModal = (payment) => {
    setEditingPayment(payment);
    setFormData({
      user_id: String(payment.user_id),
      location_id: payment.location_id ? String(payment.location_id) : '',
      amount: String(payment.amount),
      payment_date: payment.payment_date,
      payment_type: payment.payment_type,
      notes: payment.notes || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...formData,
      user_id: Number(formData.user_id),
      location_id: formData.location_id ? Number(formData.location_id) : undefined,
      amount: Number(formData.amount),
    };

    try {
      if (editingPayment) {
        await api.put(`/payments/${editingPayment.id}`, payload);
        setFeedback({ type: 'success', message: 'Payment updated successfully.' });
      } else {
        await api.post('/payments', payload);
        setFeedback({ type: 'success', message: 'Payment created successfully.' });
      }

      await fetchData();
      setShowForm(false);
      setEditingPayment(null);
      setFormData(initialForm);
    } catch (err) {
      console.error('Failed to save payment:', err);
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Failed to save payment.' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await api.delete(`/payments/${deleteTarget.id}`);
      setPayments((current) => current.filter((item) => item.id !== deleteTarget.id));
      setFeedback({ type: 'success', message: 'Payment deleted successfully.' });
    } catch (err) {
      console.error('Failed to delete payment:', err);
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Failed to delete payment.' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const paymentTypes = ['salary', 'bonus', 'commission', 'advance', 'other'];

  const uniqueStaffCount = useMemo(() => new Set(payments.map((pay) => pay.user_id)).size, [payments]);

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
        <button className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={18} /> Add Payment
        </button>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4`} role="alert">
          {feedback.message}
        </div>
      )}

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
            <h3>{uniqueStaffCount}</h3>
            <p>Unique Staff</p>
          </div>
        </div>

        <div className="stat-card card bg-light">
          <div className="stat-icon bg-info text-white">
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <h3>
              ${
                payments.length > 0
                  ? (
                      payments.reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0) /
                      payments.length
                    ).toFixed(2)
                  : '0.00'
              }
            </h3>
            <p>Avg. Payment</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body table-container">
          <table className="table">
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
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.id}</td>
                  <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                  <td>{payment.staff_name || `User #${payment.user_id}`}</td>
                  <td>
                    <strong>${Number(payment.amount).toFixed(2)}</strong>
                  </td>
                  <td>
                    <span className="badge badge-primary">{payment.payment_type}</span>
                  </td>
                  <td>{locations.find((l) => l.id === payment.location_id)?.name || payment.location_id || '—'}</td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(payment)}>
                      <Edit size={14} /> Edit
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(payment)}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!payments.length && (
                <tr>
                  <td colSpan={7} className="text-center" style={{ color: 'var(--text-secondary)' }}>
                    No payments found for the selected branch.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingPayment ? 'Edit Payment' : 'Add New Payment'}</h3>
              <button className="close-btn" onClick={() => setShowForm(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="mb-3">
                <label className="form-label">Staff Member *</label>
                <select
                  className="form-select"
                  value={formData.user_id}
                  onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                  required
                >
                  <option value="">Select staff member</option>
                  {staffMembers.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.username} ({staff.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Payment Type *</label>
                  <select
                    className="form-select"
                    value={formData.payment_type}
                    onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
                    required
                  >
                    {paymentTypes.map((type) => (
                      <option key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Date *</label>
                  <input
                    type="date"
                    className="form-control"
                    value={formData.payment_date}
                    onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">Location</label>
                <select
                  className="form-select"
                  value={formData.location_id}
                  onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
                >
                  <option value="">Use selected branch context</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label">Notes</label>
                <textarea
                  rows={3}
                  className="form-control"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional note for payroll records"
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingPayment ? 'Update' : 'Add'} Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Payment</h3>
              <button className="close-btn" onClick={() => setDeleteTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete payment <strong>#{deleteTarget.id}</strong> for{' '}
                <strong>{deleteTarget.staff_name || `User #${deleteTarget.user_id}`}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
