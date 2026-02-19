import { useEffect, useMemo, useState } from 'react';
import { Building2, UserPlus, Users, Eye } from 'lucide-react';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';

const emptyBranch = { name: '', address: '', phone: '' };
const emptyStaff = {
  username: '',
  phone_number: '',
  password: '',
  role: 'cashier',
  other_role_title: '',
  location_id: '',
  full_name: '',
  national_id: '',
  age: '',
  monthly_salary: '',
};

export default function BranchesAndStaff() {
  const { t } = useLanguage();
  const [locations, setLocations] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchForm, setBranchForm] = useState(emptyBranch);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [profile, setProfile] = useState(null);
  const [expenseSummary, setExpenseSummary] = useState(null);

  const activeStaff = useMemo(() => staff.filter((u) => u.is_active), [staff]);

  const loadData = async () => {
    try {
      const [locationsRes, staffRes, expenseRes] = await Promise.all([
        api.get('/locations'),
        api.get('/admin/users'),
        api.get('/admin/staff-expense-summary').catch(() => ({ data: null })),
      ]);
      setLocations(locationsRes.data || []);
      setStaff(staffRes.data || []);
      setExpenseSummary(expenseRes.data || null);
    } catch (err) {
      console.error('Failed to load branch/staff data', err);
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Failed to load branch/staff data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createBranch = async (e) => {
    e.preventDefault();
    setSavingBranch(true);
    try {
      const response = await api.post('/locations', branchForm);
      const nextLocations = [...locations, response.data].sort((a, b) => a.name.localeCompare(b.name));
      setLocations(nextLocations);
      setBranchForm(emptyBranch);
      setFeedback({ type: 'success', message: 'Branch created successfully.' });
      if (!staffForm.location_id && response.data?.id) {
        setStaffForm((prev) => ({ ...prev, location_id: String(response.data.id) }));
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not create branch' });
    } finally {
      setSavingBranch(false);
    }
  };

  const createStaff = async (e) => {
    e.preventDefault();
    setSavingStaff(true);
    try {
      const payload = {
        ...staffForm,
        location_id: Number(staffForm.location_id),
        age: staffForm.age ? Number(staffForm.age) : undefined,
        monthly_salary: staffForm.monthly_salary ? Number(staffForm.monthly_salary) : 0,
      };
      const response = await api.post('/admin/users', payload);
      setStaff([response.data, ...staff]);
      setFeedback({ type: 'success', message: 'Staff account created successfully.' });
      setStaffForm({ ...emptyStaff, location_id: staffForm.location_id });
      loadData();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not create staff member' });
    } finally {
      setSavingStaff(false);
    }
  };

  const toggleUserStatus = async (user) => {
    try {
      const response = await api.patch(`/admin/users/${user.id}/status`, {
        is_active: !user.is_active,
      });
      setStaff((current) => current.map((entry) => (entry.id === user.id ? { ...entry, ...response.data } : entry)));
      setFeedback({ type: 'success', message: `${response.data.full_name || response.data.username} status updated.` });
      loadData();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not update staff status' });
    }
  };

  const openProfile = async (id) => {
    try {
      const response = await api.get(`/admin/users/${id}/profile`);
      setProfile(response.data);
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not load profile' });
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t('branch')}es & Staff Setup</h2>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4`} role="alert">
          {feedback.message}
        </div>
      )}

      {expenseSummary && (
        <div className="card mb-4">
          <div className="card-body">
            <h4>Staff Expense Summary (Monthly)</h4>
            <div className="row g-3">
              <div className="col-md-4"><strong>Total:</strong> ${Number(expenseSummary.total_monthly_staff_expense || 0).toFixed(2)}</div>
              <div className="col-md-4"><strong>Active Salaries:</strong> ${Number(expenseSummary.active_salary_total || 0).toFixed(2)}</div>
              <div className="col-md-4"><strong>Prorated Exits:</strong> ${Number(expenseSummary.prorated_exit_total || 0).toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-primary text-white">
            <Building2 size={24} />
          </div>
          <div className="stat-content">
            <h3>{locations.length}</h3>
            <p>Active Branches</p>
          </div>
        </div>
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-success text-white">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <h3>{activeStaff.length}</h3>
            <p>Active Cashiers/Managers</p>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <div className="card">
            <div className="card-header"><h4>Add Branch</h4></div>
            <div className="card-body">
              <form onSubmit={createBranch}>
                <div className="mb-3">
                  <label className="form-label">Branch Name</label>
                  <input className="form-control" required value={branchForm.name} onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="mb-3">
                  <label className="form-label">Address</label>
                  <input className="form-control" value={branchForm.address} onChange={(e) => setBranchForm((p) => ({ ...p, address: e.target.value }))} />
                </div>
                <div className="mb-3">
                  <label className="form-label">Phone</label>
                  <input className="form-control" value={branchForm.phone} onChange={(e) => setBranchForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <button className="btn btn-primary" disabled={savingBranch}><Building2 size={16} /> {savingBranch ? 'Creating...' : 'Create Branch'}</button>
              </form>
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card">
            <div className="card-header"><h4>Add Employee</h4></div>
            <div className="card-body">
              <form onSubmit={createStaff}>
                <div className="row g-2">
                  <div className="col-md-6 mb-3"><label className="form-label">Full Name</label><input className="form-control" required value={staffForm.full_name} onChange={(e)=>setStaffForm((p)=>({...p,full_name:e.target.value}))} /></div>
                  <div className="col-md-6 mb-3"><label className="form-label">Username</label><input className="form-control" required value={staffForm.username} onChange={(e)=>setStaffForm((p)=>({...p,username:e.target.value}))} /></div>
                </div>
                <div className="row g-2">
                  <div className="col-md-6 mb-3"><label className="form-label">Phone Number</label><input className="form-control" required value={staffForm.phone_number} onChange={(e)=>setStaffForm((p)=>({...p,phone_number:e.target.value}))} /></div>
                  <div className="col-md-6 mb-3"><label className="form-label">National ID (optional)</label><input className="form-control" value={staffForm.national_id} onChange={(e)=>setStaffForm((p)=>({...p,national_id:e.target.value}))} /></div>
                </div>
                <div className="row g-2">
                  <div className="col-md-4 mb-3"><label className="form-label">Age</label><input type="number" className="form-control" value={staffForm.age} onChange={(e)=>setStaffForm((p)=>({...p,age:e.target.value}))} /></div>
                  <div className="col-md-4 mb-3"><label className="form-label">Monthly Salary</label><input type="number" step="0.01" className="form-control" value={staffForm.monthly_salary} onChange={(e)=>setStaffForm((p)=>({...p,monthly_salary:e.target.value}))} /></div>
                  <div className="col-md-4 mb-3"><label className="form-label">Password</label><input type="password" minLength={6} className="form-control" required value={staffForm.password} onChange={(e)=>setStaffForm((p)=>({...p,password:e.target.value}))} /></div>
                </div>
                <div className="row g-2">
                  <div className="col-md-4 mb-3">
                    <label className="form-label">Role</label>
                    <select className="form-select" value={staffForm.role} onChange={(e)=>setStaffForm((p)=>({...p,role:e.target.value}))}>
                      <option value="cashier">Cashier</option>
                      <option value="manager">Ground Manager</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="col-md-4 mb-3">
                    <label className="form-label">Branch</label>
                    <select className="form-select" required value={staffForm.location_id} onChange={(e)=>setStaffForm((p)=>({...p,location_id:e.target.value}))}>
                      <option value="">Select branch</option>
                      {locations.map((location)=><option key={location.id} value={location.id}>{location.name}</option>)}
                    </select>
                  </div>
                  {staffForm.role === 'other' && (
                    <div className="col-md-4 mb-3"><label className="form-label">Other Role Title</label><input className="form-control" required value={staffForm.other_role_title} onChange={(e)=>setStaffForm((p)=>({...p,other_role_title:e.target.value}))} /></div>
                  )}
                </div>

                <button className="btn btn-success" disabled={savingStaff || !locations.length}><UserPlus size={16} /> {savingStaff ? 'Creating...' : 'Create Staff Account'}</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h4>Staff Directory</h4></div>
        <div className="card-body table-container">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Role</th><th>Branch</th><th>Salary</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {staff.filter((u) => ['cashier', 'manager'].includes(u.role) || u.job_title).map((user) => (
                <tr key={user.id}>
                  <td>{user.full_name || user.username}</td>
                  <td>{user.phone_number || '—'}</td>
                  <td><span className={`badge ${user.role === 'manager' ? 'badge-info' : 'badge-secondary'}`}>{user.job_title || user.role}</span></td>
                  <td>{user.location_name || user.location_id || '—'}</td>
                  <td>${Number(user.monthly_salary || 0).toFixed(2)}</td>
                  <td><span className={`badge ${user.is_active ? 'badge-success' : 'badge-warning'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openProfile(user.id)}><Eye size={14} /> Profile</button>
                    <button className={`btn btn-sm ${user.is_active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleUserStatus(user)}>
                      {user.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {profile && (
        <div className="modal-overlay" onClick={() => setProfile(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Staff Profile</h3><button className="close-btn" onClick={() => setProfile(null)}>×</button></div>
            <div className="modal-body">
              <p><strong>Name:</strong> {profile.staff.full_name || profile.staff.username}</p>
              <p><strong>Role:</strong> {profile.staff.job_title || profile.staff.role}</p>
              <p><strong>Monthly Salary:</strong> ${Number(profile.staff.monthly_salary || 0).toFixed(2)}</p>
              <p><strong>Status:</strong> {profile.staff.is_active ? 'Active' : 'Inactive'}</p>
              <h4>Payroll History</h4>
              <div className="table-responsive">
                <table className="table"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Notes</th></tr></thead><tbody>
                  {(profile.payments || []).map((p) => <tr key={p.id}><td>{new Date(p.payment_date).toLocaleDateString()}</td><td>{p.payment_type}</td><td>${Number(p.amount).toFixed(2)}</td><td>{p.notes || '—'}</td></tr>)}
                </tbody></table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
