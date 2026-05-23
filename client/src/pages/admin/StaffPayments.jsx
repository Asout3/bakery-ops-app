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
  payment_type: 'salary',
  notes: '',
};

function isBranchSelectionError(error) {
  const message = String(error?.response?.data?.error || error?.message || '').toLowerCase();
  const code = String(error?.response?.data?.code || '').toUpperCase();
  return error?.response?.status === 403
    || code === 'FORBIDDEN'
    || message.includes('access to this branch');
}

function getStaffLoadMessage(primaryError, fallbackError) {
  const effectiveError = fallbackError || primaryError;
  if (!effectiveError) {
    return 'No active staff found. Add staff profiles or create staff user accounts.';
  }
  if (isBranchSelectionError(effectiveError)) {
    return 'The selected branch is no longer available. Switch to an active branch and try again.';
  }
  return getErrorMessage(effectiveError, 'Failed to load active staff for payments.');
}

const normalizeStaffTarget = (staff) => {
  const staffProfileId = Number(staff?.staff_profile_id || 0) || null;
  const userId = Number(staff?.user_id || staff?.id || 0) || null;
  return { staffProfileId, userId };
};

const getStaffOptionValue = (staff) => {
  const staffProfileId = Number(staff?.staff_profile_id || 0);
  if (staffProfileId > 0) return `sp:${staffProfileId}`;
  const userId = Number(staff?.user_id || staff?.id || 0);
  if (userId > 0) return `u:${userId}`;
  return '';
};


const moneyInputGuards = {
  onWheel: (e) => e.currentTarget.blur(),
  onKeyDown: (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
  },
};

const toMoney2 = (value) => Number(Number(value || 0).toFixed(2));
const formatDateDMY = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-GB');
};

const getStaffRoleLabel = (staff) => {
  if (!staff) return 'Staff';
  if (staff.job_title) return staff.job_title;
  if (staff.role_preference === 'manager') return 'Ground Manager';
  if (staff.role_preference === 'other') return 'Other Staff';
  return 'Cashier';
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
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
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
    setStaffLoadError('');
    try {
      const requestConfig = {
        params: { ...(selectedLocationId ? { location_id: selectedLocationId } : {}), _ts: Date.now() },
      };
      const [paymentsResult, staffResult] = await Promise.allSettled([
        api.get('/payments', requestConfig),
        api.get('/admin/staff-for-payments', requestConfig),
      ]);

      if (paymentsResult.status === 'fulfilled') {
        setPayments(paymentsResult.value.data || []);
      } else {
        setPayments([]);
        setFeedback({ type: 'danger', message: getErrorMessage(paymentsResult.reason, 'Failed to load payments data.') });
      }

      let nextStaff = [];
      let primaryStaffError = null;
      let fallbackStaffError = null;
      if (staffResult.status === 'fulfilled') {
        nextStaff = (staffResult.value.data || []).filter((staff) => staff.is_active);
      } else {
        primaryStaffError = staffResult.reason;
      }

      if (!nextStaff.length) {
        try {
          const fallbackStaffRes = await api.get('/admin/staff', requestConfig);
          nextStaff = (fallbackStaffRes.data || []).filter((staff) => staff.is_active);
        } catch (err) {
          fallbackStaffError = err;
          nextStaff = [];
        }
      }

      setStaffMembers(nextStaff);
      setStaffLoadError(nextStaff.length ? '' : getStaffLoadMessage(primaryStaffError, fallbackStaffError));
    } finally {
      setLoading(false);
    }
  };

  const handleStaffSelect = (staffOptionValue) => {
    if (!staffOptionValue) {
      setSuggestedPayment(null);
      setFormData((prev) => ({ ...prev, staff_profile_id: '' }));
      return;
    }

    const selected = staffMembers.find((s) => getStaffOptionValue(s) === staffOptionValue);
    if (!selected) {
      setSuggestedPayment(null);
      setFormData((prev) => ({ ...prev, staff_profile_id: staffOptionValue }));
      return;
    }

    const staffPayments = payments
      .filter((payment) => Number(payment.staff_profile_id) === Number(selected.staff_profile_id))
      .sort((a, b) => {
        const aDate = new Date(a.payment_date || a.created_at || 0).getTime();
        const bDate = new Date(b.payment_date || b.created_at || 0).getTime();
        return bDate - aDate;
      });

    const lastPaymentDate = staffPayments[0]?.payment_date ? new Date(staffPayments[0].payment_date) : null;
    const targetDate = new Date();
    const hireDate = selected.hire_date ? new Date(selected.hire_date) : null;
    const workedDays = lastPaymentDate ? Math.max(1, Math.ceil((targetDate - lastPaymentDate) / (1000 * 60 * 60 * 24))) : 30;
    const employmentDays = hireDate && !Number.isNaN(hireDate.getTime()) ? Math.max(1, Math.ceil((targetDate - hireDate) / (1000 * 60 * 60 * 24))) : null;
    const monthlySalary = Number(selected.monthly_salary || 0);
    const dailyRate = toMoney2(monthlySalary > 0 ? (monthlySalary / 30) : 0);
    const recommendedAmount = toMoney2(Math.max(0, dailyRate * workedDays));

    setSuggestedPayment({
      staffName: selected.full_name || 'Unknown',
      role: getStaffRoleLabel(selected),
      monthlySalary,
      workedDays,
      dailyRate,
      recommendedAmount,
      lastPaymentDate,
      account: selected.account_username || null,
      hireDate: selected.hire_date || null,
      employmentDays,
    });

    setFormData((prev) => ({
      ...prev,
      staff_profile_id: staffOptionValue,
      amount: recommendedAmount > 0 ? String(recommendedAmount) : (selected.monthly_salary ? String(toMoney2(selected.monthly_salary)) : prev.amount),
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
      const parts = [];
      if (typeof parsed?.notes === 'string' && parsed.notes.trim()) {
        parts.push(parsed.notes.trim());
      }
      if (parsed?.payment_frequency) {
        parts.push(`Frequency: ${parsed.payment_frequency}`);
      }
      if (parsed?.payout_mode) {
        parts.push(`Mode: ${parsed.payout_mode}`);
      }
      if (parsed?.payroll_month) {
        parts.push(`Payroll month: ${parsed.payroll_month}`);
      }
      if (parts.length) return parts.join(' • ');
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
    setSuggestedPayment(null);
    setEditingPayment(payment);
    setFormData({
      staff_profile_id: payment.staff_profile_id ? `sp:${payment.staff_profile_id}` : '',
      amount: String(payment.amount),
      payment_type: payment.payment_type || 'salary',
      notes: getReadableNote(payment.notes),
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    const selectedStaff = staffMembers.find((staff) => getStaffOptionValue(staff) === formData.staff_profile_id);
    const { staffProfileId, userId } = normalizeStaffTarget(selectedStaff);
    const payload = {
      staff_profile_id: staffProfileId || undefined,
      user_id: staffProfileId ? undefined : (userId || undefined),
      amount: Number(formData.amount),
      payment_type: formData.payment_type,
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

  const filteredPayments = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return payments.filter((payment) => {
      if (selectedMonth && String(payment.payment_date || '').slice(0, 7) !== selectedMonth) {
        return false;
      }
      if (!needle) return true;
      const hay = `${payment.payment_code || ''} ${payment.staff_name || ''} ${payment.created_by_name || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [payments, searchTerm, selectedMonth]);

  const summary = useMemo(() => {
    const total = filteredPayments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0);
    const monthly = payments
      .filter((payment) => String(payment.payment_date || '').slice(0, 7) === selectedMonth)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return { total, monthly };
  }, [filteredPayments, payments, selectedMonth]);

  const selectedStaffProfile = useMemo(
    () => staffMembers.find((staff) => getStaffOptionValue(staff) === formData.staff_profile_id) || null,
    [staffMembers, formData.staff_profile_id],
  );

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="staff-payments-page">
      <div className="page-header staff-payments-page-header">
        <h2>Staff Payments</h2>
        <button className="btn btn-primary" onClick={openCreateModal}><Plus size={18} /> Pay Staff</button>
      </div>
      {staffLoadError ? <div className="alert alert-warning mb-3">{staffLoadError}</div> : null}



      <div className="card staff-payments-filter-card mb-3">
        <div className="card-body">
          <div className="staff-payments-filter-head">
            <h5 className="mb-0 staff-payments-filter-title">Filters</h5>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm staff-payments-clear-btn"
              onClick={() => {
                setSelectedMonth(new Date().toISOString().slice(0, 7));
                setSearchTerm('');
              }}
            >
              Clear Filters
            </button>
          </div>

          <div className="staff-payments-filter-grid">
            <div className="staff-payments-filter-field">
              <label className="form-label">Month</label>
              <input type="month" className="form-control" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </div>

            <div className="staff-payments-filter-field staff-payments-filter-field-wide">
              <label className="form-label">Search</label>
              <input
                className="form-control"
                placeholder="Search by payment ID, staff name, creator..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="staff-payments-metrics-grid mb-4">
        <div className="card staff-payments-metric-card"><div className="staff-payments-metric-icon tone-success"><DollarSign size={20} /></div><div className="staff-payments-metric-content"><h3>ETB {summary.total.toFixed(2)}</h3><p>Selected Month Paid</p></div></div>
        <div className="card staff-payments-metric-card"><div className="staff-payments-metric-icon tone-warning"><Calendar size={20} /></div><div className="staff-payments-metric-content"><h3>ETB {summary.monthly.toFixed(2)}</h3><p>Month Total</p></div></div>
      </div>

      <div className="card staff-payments-table-card">
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
          <div className="modal-content staff-payment-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingPayment ? 'Edit Payment' : 'Create Payment'}</h3><button className="close-btn" onClick={() => setShowForm(false)}><X size={18} /></button></div>
            <form className="modal-body" onSubmit={handleSubmit}>
              <div className="row g-3">
                {suggestedPayment ? (
                  <div className="col-12">
                    <div className="staff-payment-suggestion">
                      <div className="staff-profile-preview">
                        <div className="staff-profile-avatar"><User size={18} /></div>
                        <div className="staff-profile-main">
                          <h4>{suggestedPayment.staffName}</h4>
                          <p>
                            {suggestedPayment.role} • Salary {`ETB ${suggestedPayment.monthlySalary.toFixed(2)}`}
                            {suggestedPayment.account ? ` • @${suggestedPayment.account}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="staff-payment-calculation-grid">
                        <div className="staff-payment-kpi"><span>Hire Date</span><strong>{formatDateDMY(suggestedPayment.hireDate)}</strong></div>
                        <div className="staff-payment-kpi"><span>Employment Days</span><strong>{suggestedPayment.employmentDays || 'N/A'}</strong></div>
                        <div className="staff-payment-kpi"><span>Worked Days</span><strong>{suggestedPayment.workedDays}</strong></div>
                        <div className="staff-payment-kpi"><span>Daily Rate</span><strong>ETB {suggestedPayment.dailyRate.toFixed(2)}</strong></div>
                        <div className="staff-payment-kpi"><span>Suggested Amount</span><strong>ETB {suggestedPayment.recommendedAmount.toFixed(2)}</strong></div>
                      </div>

                      <div className="staff-payment-meta">
                        {suggestedPayment.lastPaymentDate
                          ? `Last payment: ${suggestedPayment.lastPaymentDate.toLocaleDateString()}`
                          : 'No previous payment found. Using a 30-day estimate.'}
                      </div>

                      <div className="staff-payment-formula">
                        Formula: (Monthly Salary ÷ 30) x Worked Days = ETB {suggestedPayment.recommendedAmount.toFixed(2)}
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary staff-payment-suggest-btn"
                        onClick={() => setFormData((prev) => ({ ...prev, amount: String(suggestedPayment.recommendedAmount) }))}
                      >
                        Use Suggested Amount
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="col-md-6"><label className="form-label">Staff *</label><select className="form-select" value={formData.staff_profile_id} onChange={(e) => handleStaffSelect(e.target.value)} required><option value="">Select staff</option>{staffMembers.map((staff) => <option key={getStaffOptionValue(staff)} value={getStaffOptionValue(staff)}>{staff.full_name} - {getStaffRoleLabel(staff)}</option>)}</select></div>
                <div className="col-md-6"><label className="form-label">Amount *</label><input type="number" min="0" step="0.01" inputMode="decimal" className="form-control" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required {...moneyInputGuards} /></div>

                {selectedStaffProfile ? (
                  <div className="col-12">
                    <div className="staff-selected-profile-row">
                      <div><span className="label">Profile</span><strong>{selectedStaffProfile.full_name || 'Unknown'}</strong></div>
                      <div><span className="label">Role</span><strong>{getStaffRoleLabel(selectedStaffProfile)}</strong></div>
                      <div><span className="label">Hire Date</span><strong>{formatDateDMY(selectedStaffProfile.hire_date)}</strong></div>
                      <div><span className="label">Monthly Salary</span><strong>ETB {Number(selectedStaffProfile.monthly_salary || 0).toFixed(2)}</strong></div>
                    </div>
                  </div>
                ) : null}

                <div className="col-12"><label className="form-label">Notes</label><textarea rows="5" className="form-control staff-payment-notes-input" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
              </div>
              <div className="modal-footer mt-3"><button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={isSubmitting}>Cancel</button><button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : (editingPayment ? 'Update Payment' : 'Pay Now')}</button></div>
            </form>
          </div>
        </div>
      )}


      {notePreview !== null && (
        <div className="modal-overlay" onClick={() => setNotePreview(null)}>
          <div className="modal-content staff-note-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Payment Note</h3><button className="close-btn" onClick={() => setNotePreview(null)}><X size={18} /></button></div>
            <div className="modal-body"><p className="staff-note-preview-text">{notePreview || 'No notes provided.'}</p></div>
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
