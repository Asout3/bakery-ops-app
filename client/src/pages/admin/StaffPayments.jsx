import { useMemo, useState, useEffect } from 'react';
import './StaffPayments.css';
import api, { getErrorMessage } from '../../api/axios';
import { Plus, Edit, Trash2, DollarSign, Calendar, User, X, Clock, Eye } from 'lucide-react';
import { enqueueOperation } from '../../utils/offlineQueue';
import { useToast } from '../../context/ToastContext';
import { useBranch } from '../../context/BranchContext';

const PAYMENT_EDIT_WINDOW_MINUTES = 20;

const initialForm = {
  staff_profile_id: '',
  amount: '',
  payment_date: new Date().toISOString().split('T')[0],
  payment_type: 'salary',
  payment_frequency: 'monthly',
  payout_mode: 'pay_now',
  payroll_month: new Date().toISOString().slice(0, 7),
  notes: '',
};

const FREQUENCY_OPTIONS = ['daily', 'weekly', 'monthly'];

const normalizeStaffTarget = (staff) => {
  const staffProfileId = Number(staff?.staff_profile_id || 0) || null;
  const userId = Number(staff?.user_id || staff?.id || 0) || null;
  return { staffProfileId, userId };
};

export default function StaffPaymentsPage() {
  const { selectedLocationId } = useBranch();
  const [payments, setPayments] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [feedback, setFeedback] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notePreview, setNotePreview] = useState(null);
  const [suggestedPayment, setSuggestedPayment] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [staffLoadError, setStaffLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchData();
  }, [selectedLocationId]);

  useEffect(() => {
    if (!feedback?.message) return;
    if (feedback.type === 'success') toast.success(feedback.message);
    else if (feedback.type === 'warning') toast.warning(feedback.message);
    else toast.error(feedback.message);
  }, [feedback, toast]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const baseConfig = {
        headers: { 'Cache-Control': 'no-cache' },
        params: { ...(selectedLocationId ? { location_id: selectedLocationId } : {}), _ts: Date.now() },
      };
      const unscopedConfig = {
        headers: { 'Cache-Control': 'no-cache' },
        params: { _ts: Date.now() },
      };
      const [paymentsResult, staffResult] = await Promise.allSettled([
        api.get('/payments', baseConfig),
        api.get('/admin/staff-for-payments', baseConfig),
      ]);

      if (paymentsResult.status === 'fulfilled') {
        setPayments(paymentsResult.value.data || []);
      } else {
        setPayments([]);
        setFeedback({ type: 'danger', message: getErrorMessage(paymentsResult.reason, 'Failed to load payments data.') });
      }

      let nextStaff = [];
      if (staffResult.status === 'fulfilled') {
        const payload = Array.isArray(staffResult.value.data) ? staffResult.value.data : [];
        nextStaff = payload.filter((staff) => staff.is_active);
      }

      if (!nextStaff.length) {
        try {
          const fallbackStaffRes = await api.get('/admin/staff', baseConfig);
          const fallbackPayload = Array.isArray(fallbackStaffRes.data) ? fallbackStaffRes.data : [];
          nextStaff = fallbackPayload.filter((staff) => staff.is_active);
        } catch {
          nextStaff = [];
        }
      }

      if (!nextStaff.length && selectedLocationId) {
        try {
          const unscopedStaffRes = await api.get('/admin/staff-for-payments', unscopedConfig);
          const unscopedPayload = Array.isArray(unscopedStaffRes.data) ? unscopedStaffRes.data : [];
          nextStaff = unscopedPayload.filter((staff) => staff.is_active);
        } catch {
          nextStaff = [];
        }
      }

      setStaffMembers(nextStaff);
      setStaffLoadError(nextStaff.length ? '' : 'No active staff found. Add staff profiles or create staff user accounts.');
    } finally {
      setLoading(false);
    }
  };

  const handleStaffSelect = (staffId) => {
    const selected = staffMembers.find((s) => Number(s.id) === Number(staffId));
    if (!selected) return;

    const staffPayments = payments
      .filter((payment) => Number(payment.staff_profile_id) === Number(staffId))
      .sort((a, b) => {
        const aDate = new Date(a.payment_date || a.created_at || 0).getTime();
        const bDate = new Date(b.payment_date || b.created_at || 0).getTime();
        return bDate - aDate;
      });
    const lastPaymentDate = staffPayments[0]?.payment_date ? new Date(staffPayments[0].payment_date) : null;
    const targetDate = formData.payment_date ? new Date(formData.payment_date) : new Date();
    const workedDays = lastPaymentDate ? Math.max(1, Math.ceil((targetDate - lastPaymentDate) / (1000 * 60 * 60 * 24))) : 30;
    const monthlySalary = Number(selected.monthly_salary || 0);
    const dailyRate = monthlySalary > 0 ? (monthlySalary / 30) : 0;
    const recommendedAmount = Math.max(0, dailyRate * workedDays);

    setSuggestedPayment({
      workedDays,
      dailyRate,
      recommendedAmount,
      lastPaymentDate,
    });

    setFormData((prev) => ({
      ...prev,
      staff_profile_id: staffId,
      amount: recommendedAmount > 0 ? String(recommendedAmount) : (selected.monthly_salary ? String(selected.monthly_salary) : prev.amount),
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


  const getReadableNote = (noteValue) => {
    if (!noteValue) return 'No notes provided.';
    if (typeof noteValue !== 'string') return String(noteValue);
    const trimmed = noteValue.trim();
    if (!trimmed.startsWith('{')) return trimmed;

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed?.notes === 'string' && parsed.notes.trim()) return parsed.notes.trim();
      return trimmed;
    } catch {
      return trimmed;
    }
  };

  const openCreateModal = () => {
    setEditingPayment(null);
    setSuggestedPayment(null);
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
      amount: String(payment.amount),
      payment_date: payment.payment_date,
      payment_type: payment.payment_type || 'salary',
      payment_frequency: payment.payment_frequency || 'monthly',
      payout_mode: payment.payout_mode || 'pay_now',
      payroll_month: payment.payroll_month || new Date().toISOString().slice(0, 7),
      notes: payment.notes || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    const selectedStaff = staffMembers.find((staff) => Number(staff.id) === Number(formData.staff_profile_id));
    const { staffProfileId, userId } = normalizeStaffTarget(selectedStaff);
    const payload = {
      staff_profile_id: staffProfileId || undefined,
      user_id: staffProfileId ? undefined : (userId || undefined),
      amount: Number(formData.amount),
      payment_date: formData.payment_date,
      payment_type: formData.payment_type,
      payment_frequency: 'monthly',
      payout_mode: 'pay_now',
      payroll_month: null,
      notes: String(formData.notes || '').trim(),
    };

    if (payload.amount < 0) {
      setFeedback({ type: 'warning', message: 'Amount cannot be negative.' });
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingPayment) {
        await api.put(`/payments/${editingPayment.id}`, payload);
        setFeedback({ type: 'success', message: 'Payment updated successfully.' });
      } else {
        const idempotencyKey = `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await api.post('/payments', payload, { headers: { 'X-Idempotency-Key': idempotencyKey } });
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
        setFeedback({ type: 'warning', message: 'Offline: payment queued for sync.' });
        setShowForm(false);
        setFormData(initialForm);
      } else {
        setFeedback({ type: 'danger', message: getErrorMessage(err, 'Failed to save payment.') });
      }
    }
    finally {
      setIsSubmitting(false);
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

  const summary = useMemo(() => {
    const total = payments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0);
    const byFrequency = FREQUENCY_OPTIONS.reduce((acc, key) => {
      acc[key] = payments.filter((p) => (p.payment_frequency || 'monthly') === key).reduce((sum, p) => sum + Number(p.amount || 0), 0);
      return acc;
    }, {});
    return { total, byFrequency };
  }, [payments]);


  const filteredPayments = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return payments.filter((payment) => {
      const frequency = payment.payment_frequency || 'monthly';
      if (frequencyFilter !== 'all' && frequency !== frequencyFilter) return false;
      if (!needle) return true;
      const hay = `${payment.payment_code || ''} ${payment.staff_name || ''} ${payment.created_by_name || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [payments, searchTerm, frequencyFilter]);

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="staff-payments-page">
      <div className="page-header" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2>Staff Payments</h2>
        <button className="btn btn-primary" onClick={openCreateModal}><Plus size={18} /> Pay Staff</button>
      </div>
      {staffLoadError ? <div className="alert alert-warning mb-3">{staffLoadError}</div> : null}



      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-8"><input className="form-control" placeholder="Search by payment ID, staff name, creator..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
            <div className="col-md-4"><select className="form-select" value={frequencyFilter} onChange={(e) => setFrequencyFilter(e.target.value)}><option value="all">All Frequencies</option>{FREQUENCY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
          </div>
        </div>
      </div>

      <div className="stats-grid mb-4">
        <div className="stat-card card"><div className="stat-icon bg-success text-white"><DollarSign size={24} /></div><div className="stat-content"><h3>ETB {summary.total.toFixed(2)}</h3><p>Total Paid</p></div></div>
        <div className="stat-card card"><div className="stat-icon bg-primary text-white"><Calendar size={24} /></div><div className="stat-content"><h3>ETB {summary.byFrequency.daily?.toFixed(2) || '0.00'}</h3><p>Daily Paid</p></div></div>
        <div className="stat-card card"><div className="stat-icon bg-info text-white"><Calendar size={24} /></div><div className="stat-content"><h3>ETB {summary.byFrequency.weekly?.toFixed(2) || '0.00'}</h3><p>Weekly Paid</p></div></div>
        <div className="stat-card card"><div className="stat-icon bg-warning text-white"><Calendar size={24} /></div><div className="stat-content"><h3>ETB {summary.byFrequency.monthly?.toFixed(2) || '0.00'}</h3><p>Monthly Paid</p></div></div>
      </div>

      <div className="card">
        <div className="card-body table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Staff</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Edit Window</th>
                <th>Notes</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.payment_code || `PAY-${String(payment.id).padStart(6, '0')}`}</td>
                  <td>{payment.staff_name || 'Unknown'}</td>
                  <td>ETB {Number(payment.amount || 0).toFixed(2)}</td>
                  <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                  <td>{isPaymentEditable(payment) ? <span className="badge badge-warning"><Clock size={12} className="me-1" />{minutesRemaining(payment)}m left</span> : <span className="badge badge-secondary">Locked</span>}</td>
                  <td><button className="btn btn-sm btn-outline-secondary" onClick={() => setNotePreview(getReadableNote(payment.notes)) }><Eye size={14} /> View</button></td><td>
                    <button className="btn btn-sm btn-outline-primary me-2" onClick={() => openEditModal(payment)} disabled={!isPaymentEditable(payment)}><Edit size={14} /></button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => setDeleteTarget(payment)} disabled={!isPaymentEditable(payment)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {!filteredPayments.length && <tr><td colSpan="7" className="text-center text-muted">No payments match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" style={{ maxWidth: '1200px', width: '96vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingPayment ? 'Edit Payment' : 'Create Payment'}</h3><button className="close-btn" onClick={() => setShowForm(false)}><X size={18} /></button></div>
            <form className="modal-body" onSubmit={handleSubmit}>
              <div className="row g-3">
                {suggestedPayment && <div className="col-12"><div className="alert alert-info" style={{ display: 'grid', gap: '0.75rem' }}><div style={{ fontSize: '1rem', lineHeight: 1.6 }}>Worked days since last payment: <strong>{suggestedPayment.workedDays}</strong> • Daily rate: <strong>ETB {suggestedPayment.dailyRate.toFixed(2)}</strong> • Suggested payout: <strong>ETB {suggestedPayment.recommendedAmount.toFixed(2)}</strong></div><button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => setFormData((prev) => ({ ...prev, amount: String(suggestedPayment.recommendedAmount) }))}>Use Suggested Amount</button></div></div>}

                <div className="col-md-6"><label className="form-label">Staff *</label><select className="form-select" value={formData.staff_profile_id} onChange={(e) => handleStaffSelect(e.target.value)} required><option value="">Select staff</option>{staffMembers.map((staff) => <option key={staff.id} value={staff.id}>{staff.full_name}</option>)}</select></div>
                <div className="col-md-6"><label className="form-label">Amount *</label><input type="number" min="0" step="0.01" className="form-control" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required /></div>
                <div className="col-md-4"><label className="form-label">Payment Date *</label><input type="date" className="form-control" value={formData.payment_date} onChange={(e) => { const nextDate = e.target.value; setFormData({ ...formData, payment_date: nextDate }); if (formData.staff_profile_id) { const selected = staffMembers.find((st) => Number(st.id) === Number(formData.staff_profile_id)); if (selected) { const staffPayments = payments.filter((payment) => Number(payment.staff_profile_id) === Number(formData.staff_profile_id)).sort((a, b) => new Date(b.payment_date || b.created_at || 0).getTime() - new Date(a.payment_date || a.created_at || 0).getTime()); const lastPaymentDate = staffPayments[0]?.payment_date ? new Date(staffPayments[0].payment_date) : null; const targetDate = nextDate ? new Date(nextDate) : new Date(); const workedDays = lastPaymentDate ? Math.max(1, Math.ceil((targetDate - lastPaymentDate) / (1000 * 60 * 60 * 24))) : 30; const monthlySalary = Number(selected.monthly_salary || 0); const dailyRate = monthlySalary > 0 ? (monthlySalary / 30) : 0; const recommendedAmount = Math.max(0, dailyRate * workedDays); setSuggestedPayment({ workedDays, dailyRate, recommendedAmount, lastPaymentDate }); } } }} required /></div>
                <div className="col-12"><label className="form-label">Notes</label><textarea rows="5" className="form-control" style={{ minHeight: "160px", fontSize: "0.98rem" }} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
              </div>
              <div className="modal-footer mt-3"><button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={isSubmitting}>Cancel</button><button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : (editingPayment ? 'Update Payment' : 'Pay Now')}</button></div>
            </form>
          </div>
        </div>
      )}


      {notePreview !== null && (
        <div className="modal-overlay" onClick={() => setNotePreview(null)}>
          <div className="modal-content" style={{ maxWidth: "760px", width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Payment Note</h3><button className="close-btn" onClick={() => setNotePreview(null)}><X size={18} /></button></div>
            <div className="modal-body"><p style={{ whiteSpace: 'pre-wrap' }}>{notePreview || 'No notes provided.'}</p></div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setNotePreview(null)}>Close</button></div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Delete Payment</h3><button className="close-btn" onClick={() => setDeleteTarget(null)}><X size={18} /></button></div>
            <div className="modal-body"><p>Delete payment {deleteTarget.payment_code || `PAY-${String(deleteTarget.id).padStart(6, '0')}`}?</p></div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button><button className="btn btn-danger" onClick={handleDelete}>Delete</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
