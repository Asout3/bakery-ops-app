import { useEffect, useMemo, useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import api from '../../api/axios';
import { formatCurrencyETB } from '../../utils/currency';


const ETHIOPIA_PHONE_REGEX = /^\+251(9|7)\d{8}$/;

function normalizeEthiopianPhone(input) {
  const raw = String(input || '').replace(/\s+/g, '');
  if (!raw) return '+251';
  if (raw.startsWith('+251')) return raw;
  if (raw.startsWith('251')) return `+${raw}`;
  if (raw.startsWith('0')) return `+251${raw.slice(1)}`;
  if (raw.startsWith('9') || raw.startsWith('7')) return `+251${raw}`;
  return raw;
}

const emptyStaff = {
  full_name: '',
  phone_number: '+251',
  national_id: '',
  age: '',
  monthly_salary: '',
  role_preference: 'cashier',
  other_role_title: '',
  payment_due_date: '25',
};

export default function StaffManagement() {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [expenseSummary, setExpenseSummary] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [profile, setProfile] = useState(null);

  const activeStaff = useMemo(() => staff.filter((u) => u.is_active), [staff]);
  const inactiveStaff = useMemo(() => staff.filter((u) => !u.is_active), [staff]);
  const load = async () => {
    try {
      const [staffRes, expenseRes] = await Promise.all([
        api.get('/admin/staff'),
        api.get('/admin/staff-expense-summary').catch(() => ({ data: null })),
      ]);
      setStaff(staffRes.data || []);
      setExpenseSummary(expenseRes.data || null);
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Failed to load staff management data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createStaff = async (e) => {
    e.preventDefault();
    const normalizedPhone = normalizeEthiopianPhone(staffForm.phone_number);
    if (!ETHIOPIA_PHONE_REGEX.test(normalizedPhone)) {
      setFeedback({ type: 'danger', message: 'Phone must be +2519XXXXXXXX or +2517XXXXXXXX.' });
      return;
    }
    if (staffForm.age && Number(staffForm.age) < 17) {
      setFeedback({ type: 'danger', message: 'Age must be greater than 16.' });
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/staff', {
        ...staffForm,
        phone_number: normalizedPhone,
        age: staffForm.age ? Number(staffForm.age) : undefined,
        monthly_salary: staffForm.monthly_salary ? Number(staffForm.monthly_salary) : 0,
        payment_due_date: staffForm.payment_due_date ? Number(staffForm.payment_due_date) : 25,
      });
      setFeedback({ type: 'success', message: 'Staff profile created.' });
      setStaffForm({ ...emptyStaff });
      load();
    } catch (err) {
      const validationText = err.response?.data?.errors?.map((x) => x.msg).join(', ');
      setFeedback({ type: 'danger', message: validationText || err.response?.data?.error || 'Could not create staff profile' });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row) => {
    try {
      await api.patch(`/admin/staff/${row.id}/status`, { is_active: !row.is_active });
      load();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not update status' });
    }
  };

  const editStaff = async (row) => {
    const full_name = row.full_name;
    const phone_number = normalizeEthiopianPhone(row.phone_number || '+251');
    const monthly_salary = Number(row.monthly_salary || 0);
    if (!ETHIOPIA_PHONE_REGEX.test(phone_number)) {
      setFeedback({ type: 'danger', message: 'Phone must be +2519XXXXXXXX or +2517XXXXXXXX.' });
      return;
    }
    if (row.age && Number(row.age) < 17) {
      setFeedback({ type: 'danger', message: 'Age must be greater than 16.' });
      return;
    }
    const role_preference = row.role_preference || 'cashier';
    try {
      await api.put(`/admin/staff/${row.id}`, {
        full_name,
        phone_number,
        monthly_salary,
        role_preference,
        national_id: row.national_id || null,
        age: row.age || null,
        other_role_title: role_preference === 'other' ? (row.job_title || 'Other Staff') : undefined,
      });
      setFeedback({ type: 'success', message: 'Staff profile updated.' });
      load();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not update staff profile' });
    }
  };

  const deleteStaff = async (row) => {
    if (!window.confirm(`Delete staff profile ${row.full_name}?`)) return;
    try {
      await api.delete(`/admin/staff/${row.id}`);
      setFeedback({ type: 'success', message: 'Staff profile deleted.' });
      load();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not delete staff profile' });
    }
  };

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header"><h2>Staff Management</h2></div>
      {feedback && <div className={`alert alert-${feedback.type} mb-4`}>{feedback.message}</div>}

      {expenseSummary && (
        <div className="card mb-4"><div className="card-body">
          <h4>Staff Expense Summary (Monthly)</h4>
          <div className="row g-3">
            <div className="col-md-4"><strong>Total:</strong> {formatCurrencyETB(expenseSummary.total_monthly_staff_expense || 0)}</div>
            <div className="col-md-4"><strong>Active Salaries:</strong> {formatCurrencyETB(expenseSummary.active_salary_total || 0)}</div>
            <div className="col-md-4"><strong>Prorated Exits:</strong> {formatCurrencyETB(expenseSummary.prorated_exit_total || 0)}</div>
          </div>
        </div></div>
      )}

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light"><div className="stat-icon bg-success text-white"><Users size={24} /></div><div className="stat-content"><h3>{activeStaff.length}</h3><p>Active Staff Profiles</p></div></div>
      </div>

      <div className="card mb-4"><div className="card-header"><h4>Create Staff Profile</h4></div><div className="card-body">
        <form onSubmit={createStaff}>
          <div className="row g-2">
            <div className="col-md-6 mb-3"><label className="form-label">Full Name</label><input className="form-control" required value={staffForm.full_name} onChange={(e)=>setStaffForm((p)=>({...p,full_name:e.target.value}))} /></div>
            <div className="col-md-6 mb-3"><label className="form-label">Phone Number</label><input className="form-control" required placeholder="+2519XXXXXXXX" pattern="^\+251(9|7)\d{8}$" value={staffForm.phone_number} onChange={(e)=>setStaffForm((p)=>({...p,phone_number:normalizeEthiopianPhone(e.target.value)}))} /></div>
          </div>
          <div className="row g-2">
            <div className="col-md-4 mb-3"><label className="form-label">National ID (optional)</label><input className="form-control" value={staffForm.national_id} onChange={(e)=>setStaffForm((p)=>({...p,national_id:e.target.value}))} /></div>
            <div className="col-md-4 mb-3"><label className="form-label">Age</label><input type="number" min="17" className="form-control" value={staffForm.age} onChange={(e)=>setStaffForm((p)=>({...p,age:e.target.value}))} /></div>
            <div className="col-md-4 mb-3"><label className="form-label">Monthly Salary</label><input type="number" step="0.01" className="form-control" value={staffForm.monthly_salary} onChange={(e)=>setStaffForm((p)=>({...p,monthly_salary:e.target.value}))} /></div>
          </div>
          <div className="row g-2">
            <div className="col-md-4 mb-3"><label className="form-label">Role</label><select className="form-select" value={staffForm.role_preference} onChange={(e)=>setStaffForm((p)=>({...p,role_preference:e.target.value}))}><option value="cashier">Cashier</option><option value="manager">Ground Manager</option><option value="other">Other</option></select></div>
            
            <div className="col-md-4 mb-3"><label className="form-label">Salary Due Day (1-28)</label><input type="number" min="1" max="28" className="form-control" value={staffForm.payment_due_date} onChange={(e)=>setStaffForm((p)=>({...p,payment_due_date:e.target.value}))} placeholder="25" /><small className="text-muted">Day of month to pay salary</small></div>
            {staffForm.role_preference === 'other' && <div className="col-md-4 mb-3"><label className="form-label">Other Role Title</label><input className="form-control" required value={staffForm.other_role_title} onChange={(e)=>setStaffForm((p)=>({...p,other_role_title:e.target.value}))} /></div>}
          </div>
          <button className="btn btn-success" disabled={saving}><UserPlus size={16} /> {saving ? 'Saving...' : 'Save Staff Profile'}</button>
        </form>
      </div></div>

      <div className="card"><div className="card-header"><h4>Staff Directory</h4></div><div className="card-body table-container">
        <h5 className="mb-2">Active Staff</h5><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Salary</th><th>Account</th><th>Status</th><th>Actions</th></tr></thead><tbody>{activeStaff.map((row) => <tr key={row.id}><td>{row.full_name}</td><td>{row.job_title || row.role_preference}</td><td>{formatCurrencyETB(row.monthly_salary || 0)}</td><td>{row.account_username ? row.account_username : 'No account yet'}</td><td><span className="badge badge-success">Active</span></td><td style={{ display:'flex', gap:'0.5rem' }}><button className="btn btn-sm btn-secondary" onClick={()=>setProfile({ ...row })}>View/Edit</button><button className="btn btn-sm btn-danger" onClick={()=>toggleStatus(row)}>Disable</button><button className="btn btn-sm btn-danger" onClick={()=>deleteStaff(row)}>Delete</button></td></tr>)}{!activeStaff.length && <tr><td colSpan={6} className="text-center text-muted">No active staff.</td></tr>}</tbody></table><h5 className="mt-4 mb-2">Inactive Staff</h5><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Salary</th><th>Account</th><th>Status</th><th>Actions</th></tr></thead><tbody>{inactiveStaff.map((row) => <tr key={`inactive-${row.id}`}><td>{row.full_name}</td><td>{row.job_title || row.role_preference}</td><td>{formatCurrencyETB(row.monthly_salary || 0)}</td><td>{row.account_username ? row.account_username : 'No account yet'}</td><td><span className="badge badge-warning">Inactive</span></td><td style={{ display:'flex', gap:'0.5rem' }}><button className="btn btn-sm btn-secondary" onClick={()=>setProfile({ ...row })}>View/Edit</button><button className="btn btn-sm btn-success" onClick={()=>toggleStatus(row)}>Enable</button><button className="btn btn-sm btn-danger" onClick={()=>deleteStaff(row)}>Delete</button></td></tr>)}{!inactiveStaff.length && <tr><td colSpan={6} className="text-center text-muted">No inactive staff.</td></tr>}</tbody></table>
      </div></div>

      {profile && (
        <div className="modal-overlay" onClick={() => setProfile(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Staff Profile</h3><button className="close-btn" onClick={() => setProfile(null)}>×</button></div>
            <div className="modal-body">
              <div className="row g-2">
                <div className="col-md-6 mb-3"><label className="form-label">Full Name</label><input className="form-control" value={profile.full_name || ''} onChange={(e)=>setProfile((p)=>({...p,full_name:e.target.value}))} /></div>
                <div className="col-md-6 mb-3"><label className="form-label">Phone</label><input className="form-control" placeholder="+2519XXXXXXXX" pattern="^\+251(9|7)\d{8}$" value={profile.phone_number || '+251'} onChange={(e)=>setProfile((p)=>({...p,phone_number:normalizeEthiopianPhone(e.target.value)}))} /></div>
              </div>
              <div className="row g-2">
                <div className="col-md-4 mb-3"><label className="form-label">National ID</label><input className="form-control" value={profile.national_id || ''} onChange={(e)=>setProfile((p)=>({...p,national_id:e.target.value}))} /></div>
                <div className="col-md-4 mb-3"><label className="form-label">Age</label><input type="number" min="17" className="form-control" value={profile.age || ''} onChange={(e)=>setProfile((p)=>({...p,age:e.target.value}))} /></div>
                <div className="col-md-4 mb-3"><label className="form-label">Monthly Salary</label><input type="number" className="form-control" value={profile.monthly_salary || ''} onChange={(e)=>setProfile((p)=>({...p,monthly_salary:e.target.value}))} /></div>
              </div>
              <div className="row g-2">
                <div className="col-md-9 mb-3"><label className="form-label">Salary Growth (ETB)</label><input type="number" min="0" step="0.01" className="form-control form-control-lg" style={{ minHeight: "56px", fontSize: "1.05rem" }} value={profile.salary_growth || ''} onChange={(e)=>setProfile((p)=>({...p,salary_growth:e.target.value}))} placeholder="Increase amount" /></div>
                <div className="col-md-3 mb-3 d-flex align-items-end"><button className="btn btn-outline-primary btn-lg w-100" type="button" onClick={() => setProfile((p) => ({ ...p, monthly_salary: (Number(p.monthly_salary || 0) + Number(p.salary_growth || 0)).toFixed(2), salary_growth: '' }))}>Apply Growth</button></div>
              </div>

              <div className="row g-2">
                <div className="col-md-4 mb-3"><label className="form-label">Role</label><input className="form-control" value={profile.role_preference === 'manager' ? 'Ground Manager' : profile.role_preference === 'other' ? 'Other' : 'Cashier'} readOnly /></div>
                {profile.role_preference === 'other' && <div className="col-md-8 mb-3"><label className="form-label">Other Title</label><input className="form-control" value={profile.job_title || ''} onChange={(e)=>setProfile((p)=>({...p,job_title:e.target.value}))} /></div>}
              </div>
              <button className="btn btn-primary" onClick={async()=>{await editStaff(profile); setProfile(null);}}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
