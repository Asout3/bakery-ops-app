import { useMemo, useState, useEffect } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { Plus, Edit, Trash2, DollarSign, Calendar, User, X, Clock } from 'lucide-react';
import { enqueueOperation } from '../../utils/offlineQueue';

const PAYMENT_EDIT_WINDOW_MINUTES = 20;

const initialForm = {
  staff_profile_id: '',
  amount: '',
  payment_date: new Date().toISOString().split('T')[0],
  payment_type: 'salary',
  notes: '',
};

export default function StaffPaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [feedback, setFeedback] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [paymentsRes, staffRes] = await Promise.all([
        api.get('/payments'),
        api.get('/admin/staff-for-payments'),
      ]);
      setPayments(paymentsRes.data || []);
      setStaffMembers((staffRes.data || []).filter((staff) => staff.is_active));
    } catch (err) {
      setFeedback({ type: 'danger', message: getErrorMessage(err, 'Failed to load payments data.') });
    } finally {
      setLoading(false);
    }
  };

  const handleStaffSelect = (staffId) => {
    const selected = staffMembers.find((s) => Number(s.id) === Number(staffId));
    if (!selected) return;
    setFormData((prev) => ({
      ...prev,
      staff_profile_id: staffId,
      user_id: selected.user_id ? String(selected.user_id) : prev.user_id,
      amount: selected.monthly_salary ? String(selected.monthly_salary) : prev.amount,
    }));
  };

  const isPaymentEditable = (payment) => {
    if (typeof payment.can_edit === 'boolean') return payment.can_edit;
    const createdAt = payment.created_at ? new Date(payment.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
    return (Date.now() - createdAt.getTime()) / 60000 <= PAYMENT_EDIT_WINDOW_MINUTES;
  };

  const minutesRemaining = (payment) => {
    if (Number.isFinite(Number(payment.age_minutes))) {
      return Math.max(0, Math.ceil(PAYMENT_EDIT_WINDOW_MINUTES - Number(payment.age_minutes)));
    }
    const createdAt = payment.created_at ? new Date(payment.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return 0;
    return Math.max(0, Math.ceil(PAYMENT_EDIT_WINDOW_MINUTES - ((Date.now() - createdAt.getTime()) / 60000)));
  };

  const openCreateModal = () => {
    setEditingPayment(null);
    setFormData(initialForm);
    setShowForm(true);
  };

  const openEditModal = (payment) => {
    if (!isPaymentEditable(payment)) {
      setFeedback({ type: 'warning', message: 'This payment is locked after 20 minutes and cannot be edited.' });
      return;
    }
    setEditingPayment(payment);
    setFormData({
      staff_profile_id: payment.staff_profile_id ? String(payment.staff_profile_id) : '',
      user_id: payment.user_id ? String(payment.user_id) : '',
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
      staff_profile_id: formData.staff_profile_id ? Number(formData.staff_profile_id) : undefined,
      user_id: formData.user_id ? Number(formData.user_id) : undefined,
      amount: Number(formData.amount),
      payment_date: formData.payment_date,
      payment_type: formData.payment_type,
      notes: formData.notes,
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
      if (!editingPayment && !err.response) {
        const idempotencyKey = `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ id: idempotencyKey, url: '/payments', method: 'post', data: payload, idempotencyKey });
        setPayments((current) => [{
          id: idempotencyKey,
          payment_date: payload.payment_date,
          staff_name: staffMembers.find((s) => Number(s.id) === Number(formData.staff_profile_id))?.full_name || 'Pending staff payment',
          user_id: payload.user_id,
          amount: payload.amount,
          payment_type: payload.payment_type,
          is_pending_sync: true,
          can_edit: true,
          age_minutes: 0,
        }, ...current]);
        setFeedback({ type: 'warning', message: 'Offline: payment queued for sync.' });
        setShowForm(false);
        setFormData(initialForm);
      } else {
        setFeedback({ type: 'danger', message: getErrorMessage(err, 'Failed to save payment.') });
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!isPaymentEditable(deleteTarget)) {
      setDeleteTarget(null);
      setFeedback({ type: 'warning', message: 'This payment is locked after 20 minutes and cannot be deleted.' });
      return;
    }
    try {
      await api.delete(`/payments/${deleteTarget.id}`);
      setPayments((current) => current.filter((item) => item.id !== deleteTarget.id));
      setFeedback({ type: 'success', message: 'Payment deleted successfully.' });
    } catch (err) {
      setFeedback({ type: 'danger', message: getErrorMessage(err, 'Failed to delete payment.') });
    } finally {
      setDeleteTarget(null);
    }
  };

  const paymentTypeOptions = [
    { value: 'salary', label: 'Salary', description: 'Regular salary payment for the pay period.' },
    { value: 'bonus', label: 'Bonus', description: 'Additional performance or incentive payment.' },
    { value: 'commission', label: 'Commission', description: 'Sales-based variable payment.' },
    { value: 'advance', label: 'Advance', description: 'Advance paid before the standard payday.' },
    { value: 'prorated_exit', label: 'Final Exit Payment (Prorated)', description: 'Final payment for partial days worked before staff exit.' },
    { value: 'other', label: 'Other', description: 'Any other payment type with notes.' },
  ];

  const paymentTypeLabel = (value) => paymentTypeOptions.find((option) => option.value === value)?.label || value;
  const uniqueStaffCount = useMemo(() => new Set(payments.map((pay) => pay.user_id || pay.staff_profile_id)).size, [payments]);

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header">
        <h2>Staff Payments</h2>
        <button className="btn btn-primary" onClick={openCreateModal}><Plus size={16} /> Add Payment</button>
      </div>

      {feedback && <div className={`alert alert-${feedback.type} mb-3`}>{feedback.message}</div>}

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light"><div className="stat-icon bg-success text-white"><DollarSign size={24} /></div><div className="stat-content"><h3>ETB {payments.reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0).toFixed(2)}</h3><p>Total Payments</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-primary text-white"><User size={24} /></div><div className="stat-content"><h3>{uniqueStaffCount}</h3><p>Unique Staff</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-info text-white"><Calendar size={24} /></div><div className="stat-content"><h3>ETB {payments.length > 0 ? (payments.reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0) / payments.length).toFixed(2) : '0.00'}</h3><p>Avg. Payment</p></div></div>
      </div>

      <div className="card">
        <div className="card-body table-container">
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Date</th><th>Staff Member</th><th>Amount</th><th>Type</th><th>Edit Window</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const editable = isPaymentEditable(payment);
                return (
                  <tr key={payment.id}>
                    <td>{payment.id}</td>
                    <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                    <td>{payment.staff_name || `User #${payment.user_id}`}</td>
                    <td><strong>ETB {Number(payment.amount).toFixed(2)}</strong></td>
                    <td><span className="badge badge-primary">{paymentTypeLabel(payment.payment_type)}</span>{payment.is_pending_sync && <span className="badge badge-warning" style={{ marginLeft: '0.4rem' }}>Pending Sync</span>}</td>
                    <td>{editable ? <span className="badge badge-warning"><Clock size={12} /> {minutesRemaining(payment)}m</span> : <span className="badge badge-secondary">Locked</span>}</td>
                    <td style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-sm btn-secondary" disabled={!editable} onClick={() => openEditModal(payment)}><Edit size={14} /> Edit</button>
                      <button className="btn btn-sm btn-danger" disabled={!editable} onClick={() => setDeleteTarget(payment)}><Trash2 size={14} /> Delete</button>
                    </td>
                  </tr>
                );
              })}
              {!payments.length && (
                <tr><td colSpan={7} className="text-center" style={{ color: 'var(--text-secondary)' }}>No payments found.</td></tr>
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
              <button className="close-btn" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="mb-3">
                <label className="form-label">Staff Member *</label>
                <select className="form-select" value={formData.staff_profile_id} onChange={(e) => handleStaffSelect(e.target.value)} required>
                  <option value="">Select staff member</option>
                  {staffMembers.map((staff) => (
                    <option key={staff.id} value={staff.id}>{staff.full_name} ({staff.job_title || staff.role_preference}) - Due: {staff.payment_due_date || 25}th</option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label">Amount *</label>
                <input type="number" step="0.01" className="form-control" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required />
              </div>

              <div className="alert alert-info" role="note">{paymentTypeOptions.find((option) => option.value === formData.payment_type)?.description}</div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Payment Type *</label>
                  <select className="form-select" value={formData.payment_type} onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })} required>
                    {paymentTypeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-control" value={formData.payment_date} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })} required />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>

              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-primary">{editingPayment ? 'Update Payment' : 'Create Payment'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Delete Payment</h3><button className="close-btn" onClick={() => setDeleteTarget(null)}><X size={18} /></button></div>
            <div className="modal-body">
              <p>Delete this payment record? This cannot be undone.</p>
              <div className="d-flex gap-2">
                <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
                <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
