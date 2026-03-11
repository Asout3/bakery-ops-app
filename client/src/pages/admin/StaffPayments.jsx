import { useMemo, useState, useEffect } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { Plus, Edit, Trash2, DollarSign, Calendar, Clock, Eye, RotateCcw, Search } from 'lucide-react';
import { enqueueOperation } from '../../utils/offlineQueue';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/Table';
import { Textarea } from '../../components/ui/Textarea';
import { Alert } from '../../components/ui/Alert';
import { Skeleton } from '../../components/ui/Skeleton';

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

export default function StaffPaymentsPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [payments, setPayments] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [notePreview, setNotePreview] = useState(null);
  const [suggestedPayment, setSuggestedPayment] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [paymentsRes, staffRes] = await Promise.all([
        api.get('/payments'),
        api.get('/admin/staff-for-payments'),
      ]);
      setPayments(paymentsRes.data || []);
      setStaffMembers((staffRes.data || []).filter((staff) => staff.is_active));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load payments data.'));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      user_id: selected.user_id ? String(selected.user_id) : prev.user_id,
      amount: recommendedAmount > 0 ? recommendedAmount.toFixed(2) : (selected.monthly_salary ? String(selected.monthly_salary) : prev.amount),
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
      toast.warning('This payment is locked after 20 minutes and cannot be edited.');
      return;
    }
    setEditingPayment(payment);
    setFormData({
      staff_profile_id: payment.staff_profile_id ? String(payment.staff_profile_id) : '',
      user_id: payment.user_id ? String(payment.user_id) : '',
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
    const payload = {
      staff_profile_id: formData.staff_profile_id ? Number(formData.staff_profile_id) : undefined,
      user_id: formData.user_id ? Number(formData.user_id) : undefined,
      amount: Number(formData.amount),
      payment_date: formData.payment_date,
      payment_type: formData.payment_type,
      payment_frequency: 'monthly',
      payout_mode: 'pay_now',
      payroll_month: null,
      notes: String(formData.notes || '').trim(),
    };

    if (payload.amount < 0) {
      toast.warning('Amount cannot be negative.');
      return;
    }
    try {
      if (editingPayment) {
        await api.put(`/payments/${editingPayment.id}`, payload);
        toast.success('Payment updated successfully.');
      } else {
        await api.post('/payments', payload);
        toast.success('Payment created successfully.');
      }
      await fetchData();
      setShowForm(false);
      setEditingPayment(null);
      setFormData(initialForm);
    } catch (err) {
      if (!editingPayment && !err.response) {
        const idempotencyKey = `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ id: idempotencyKey, url: '/payments', method: 'post', data: payload, idempotencyKey });
        toast.warning('Offline: payment queued for sync.');
        setShowForm(false);
        setFormData(initialForm);
      } else {
        toast.error(getErrorMessage(err, 'Failed to save payment.'));
      }
    }
  };

  const handleDelete = async (payment) => {
    if (!isPaymentEditable(payment)) {
      toast.warning('This payment is locked and cannot be deleted.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Delete Payment?',
      message: `Are you sure you want to delete payment ${payment.payment_code || payment.id}?`,
      variant: 'danger'
    });

    if (!isConfirmed) return;

    try {
      await api.delete(`/payments/${payment.id}`);
      setPayments((current) => current.filter((item) => item.id !== payment.id));
      toast.success('Payment deleted successfully.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete payment.'));
    }
  };

  const summary = useMemo(() => {
    const total = payments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0);
    const byFrequency = { daily: 0, weekly: 0, monthly: 0 };
    payments.forEach(p => {
      const freq = p.payment_frequency || 'monthly';
      if (byFrequency[freq] !== undefined) byFrequency[freq] += Number(p.amount || 0);
    });
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

  if (loading) return (
    <div className="animate-fade-in">
       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
         <Skeleton width="220px" height="2.5rem" />
         <Skeleton width="140px" height="2.5rem" />
       </div>
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height="100px" />)}
       </div>
       <Skeleton height="80px" style={{ marginBottom: '2rem' }} />
       <Skeleton height="400px" />
    </div>
  );

  return (
    <div className="staff-payments-page animate-fade-in">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem' }}>{t('staffPayments')}</h1>
        <Button variant="primary" onClick={openCreateModal}>
          <Plus size={18} /> Pay Staff
        </Button>
      </div>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <StatCard label="Total Paid" value={`ETB ${summary.total.toFixed(2)}`} icon={<DollarSign size={24} />} variant="success" />
        <StatCard label="Daily Paid" value={`ETB ${summary.byFrequency.daily.toFixed(2)}`} icon={<Calendar size={24} />} />
        <StatCard label="Weekly Paid" value={`ETB ${summary.byFrequency.weekly.toFixed(2)}`} icon={<Calendar size={24} />} variant="info" />
        <StatCard label="Monthly Paid" value={`ETB ${summary.byFrequency.monthly.toFixed(2)}`} icon={<Calendar size={24} />} variant="warning" />
      </div>

      <Card style={{ marginBottom: '2rem' }}>
        <CardBody style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <Input
              placeholder="Search by ID, staff name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.75rem' }}
            />
          </div>
          <Select
            value={frequencyFilter}
            onChange={(e) => setFrequencyFilter(e.target.value)}
            style={{ width: '180px' }}
            options={[
              { label: 'All Frequencies', value: 'all' },
              { label: 'Daily', value: 'daily' },
              { label: 'Weekly', value: 'weekly' },
              { label: 'Monthly', value: 'monthly' }
            ]}
          />
          <Button variant="secondary" onClick={() => { setSearchTerm(''); setFrequencyFilter('all'); fetchData(); }}>
            <RotateCcw size={18} />
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Payment ID</TH>
                <TH>Staff</TH>
                <TH>Amount</TH>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH>Notes</TH>
                <TH style={{ textAlign: 'right' }}>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filteredPayments.map((payment) => (
                <TR key={payment.id}>
                  <TD style={{ fontSize: '0.8125rem', fontFamily: 'monospace', fontWeight: 600 }}>
                    {payment.payment_code || `PAY-${String(payment.id).padStart(6, '0')}`}
                  </TD>
                  <TD style={{ fontWeight: 600 }}>{payment.staff_name || 'Unknown'}</TD>
                  <TD style={{ fontWeight: 700, color: 'var(--success-text)' }}>ETB {Number(payment.amount || 0).toFixed(2)}</TD>
                  <TD>{new Date(payment.payment_date).toLocaleDateString()}</TD>
                  <TD>
                    {isPaymentEditable(payment) ? (
                      <Badge variant="warning">
                        <Clock size={12} style={{ marginRight: '0.25rem' }} /> {minutesRemaining(payment)}m left
                      </Badge>
                    ) : (
                      <Badge variant="info">Locked</Badge>
                    )}
                  </TD>
                  <TD>
                    <Button variant="outline" size="sm" onClick={() => setNotePreview(getReadableNote(payment.notes))}>
                      <Eye size={14} /> View
                    </Button>
                  </TD>
                  <TD style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEditModal(payment)}
                        disabled={!isPaymentEditable(payment)}
                      >
                        <Edit size={14} />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(payment)}
                        disabled={!isPaymentEditable(payment)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
              {!filteredPayments.length && (
                <TR>
                  <TD colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>No payments match the current filters.</div>
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingPayment ? 'Edit Staff Payment' : 'Process Staff Payment'}
        size="md"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {suggestedPayment && (
            <Alert variant="info" title="Payment Suggestion">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                 <div>Days worked: <strong>{suggestedPayment.workedDays}</strong> • Rate: <strong>ETB {suggestedPayment.dailyRate.toFixed(2)}/day</strong></div>
                 <Button size="sm" onClick={() => setFormData(prev => ({ ...prev, amount: suggestedPayment.recommendedAmount.toFixed(2) }))} type="button">
                   Use Suggested: ETB {suggestedPayment.recommendedAmount.toFixed(2)}
                 </Button>
              </div>
            </Alert>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <Select
              label="Staff Member *"
              value={formData.staff_profile_id}
              onChange={(e) => handleStaffSelect(e.target.value)}
              required
              options={[
                { label: 'Select staff member', value: '' },
                ...staffMembers.map(s => ({ label: s.full_name, value: s.id }))
              ]}
            />
            <Input
              label="Amount (ETB) *"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
              min="0"
            />
          </div>

          <Input
            label="Payment Date *"
            type="date"
            value={formData.payment_date}
            onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
            required
          />

          <Textarea
            label="Notes"
            placeholder="Add any details about this payment..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setShowForm(false)} type="button">Cancel</Button>
            <Button type="submit">
              {editingPayment ? 'Update Payment' : 'Process Payment'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={notePreview !== null}
        onClose={() => setNotePreview(null)}
        title="Payment Notes"
        size="sm"
      >
        <div style={{ padding: '0.5rem' }}>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-primary)' }}>
            {notePreview || 'No notes provided.'}
          </p>
          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
             <Button variant="secondary" onClick={() => setNotePreview(null)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ label, value, icon, variant = 'primary' }) {
  const colors = {
    primary: { bg: 'rgba(244, 162, 97, 0.1)', color: 'var(--button-end)' },
    success: { bg: 'var(--success-bg)', color: 'var(--success-text)' },
    info: { bg: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' },
    warning: { bg: 'rgba(255, 152, 0, 0.1)', color: '#f57c00' },
  };
  const current = colors[variant] || colors.primary;

  return (
    <Card>
      <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: current.bg, color: current.color, display: 'grid', placeItems: 'center' }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{value}</div>
        </div>
      </CardBody>
    </Card>
  );
}
