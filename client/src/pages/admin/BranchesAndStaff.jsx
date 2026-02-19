import { useEffect, useState } from 'react';
import { Building2, UserPlus, Users } from 'lucide-react';
import api from '../../api/axios';

const emptyBranch = { name: '', address: '', phone: '' };
const emptyAccount = {
  staff_profile_id: '',
  username: '',
  password: '',
  role: 'cashier',
  location_id: '',
};

export default function BranchesAndStaff() {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [staffProfiles, setStaffProfiles] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [branchForm, setBranchForm] = useState(emptyBranch);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const loadData = async () => {
    try {
      const [locationsRes, staffRes, accountsRes] = await Promise.all([
        api.get('/locations'),
        api.get('/admin/staff').catch(() => ({ data: [] })),
        api.get('/admin/users').catch(() => ({ data: [] })),
      ]);
      setLocations(locationsRes.data || []);
      setStaffProfiles(staffRes.data || []);
      setAccounts(accountsRes.data || []);
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Failed to load branch/account data' });
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
      await api.post('/locations', branchForm);
      setBranchForm(emptyBranch);
      setFeedback({ type: 'success', message: 'Branch created successfully.' });
      loadData();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not create branch' });
    } finally {
      setSavingBranch(false);
    }
  };

  const createAccount = async (e) => {
    e.preventDefault();
    setSavingAccount(true);
    try {
      await api.post('/admin/users', {
        ...accountForm,
        location_id: Number(accountForm.location_id),
        staff_profile_id: Number(accountForm.staff_profile_id),
      });
      setFeedback({ type: 'success', message: 'Staff account created successfully.' });
      setAccountForm(emptyAccount);
      loadData();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not create staff account' });
    } finally {
      setSavingAccount(false);
    }
  };

  const onStaffSelect = (staffId) => {
    const selected = staffProfiles.find((s) => Number(s.id) === Number(staffId));
    setAccountForm((p) => ({
      ...p,
      staff_profile_id: staffId,
      role: selected?.role_preference === 'manager' ? 'manager' : 'cashier',
      location_id: selected?.location_id ? String(selected.location_id) : p.location_id,
    }));
  };

  const toggleAccountStatus = async (user) => {
    try {
      await api.patch(`/admin/users/${user.id}/status`, { is_active: !user.is_active });
      loadData();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not update account status' });
    }
  };

  const editBranch = async (branch) => {
    const name = window.prompt('Branch name', branch.name);
    if (!name) return;
    const address = window.prompt('Address', branch.address || '');
    const phone = window.prompt('Phone', branch.phone || '');
    try {
      await api.put(`/locations/${branch.id}`, { name, address, phone, is_active: branch.is_active });
      setFeedback({ type: 'success', message: 'Branch updated.' });
      loadData();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not update branch' });
    }
  };

  const deleteBranch = async (branch) => {
    if (!window.confirm(`Delete/disable branch "${branch.name}"?`)) return;
    try {
      const res = await api.delete(`/locations/${branch.id}`);
      setFeedback({ type: 'success', message: res.data?.message || 'Branch removed.' });
      loadData();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not remove branch' });
    }
  };

  const editAccount = async (user) => {
    const username = window.prompt('Username', user.username);
    if (!username) return;
    const role = window.prompt('Role (cashier or manager)', user.role) || user.role;
    const location_id = Number(window.prompt('Branch id', String(user.location_id || '')) || user.location_id);
    const password = window.prompt('New password (leave blank to keep current)', '');
    try {
      await api.put(`/admin/users/${user.id}`, { username, role, location_id, ...(password ? { password } : {}) });
      setFeedback({ type: 'success', message: 'Account updated.' });
      loadData();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not update account' });
    }
  };

  const deleteAccount = async (user) => {
    if (!window.confirm(`Delete account ${user.username}?`)) return;
    try {
      await api.delete(`/admin/users/${user.id}`);
      setFeedback({ type: 'success', message: 'Account deleted.' });
      loadData();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.error || 'Could not delete account' });
    }
  };

  const availableStaff = staffProfiles.filter((s) => s.is_active && !s.linked_user_id);

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header"><h2>Branch & Account Management</h2></div>
      {feedback && <div className={`alert alert-${feedback.type} mb-4`}>{feedback.message}</div>}

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light"><div className="stat-icon bg-primary text-white"><Building2 size={24} /></div><div className="stat-content"><h3>{locations.length}</h3><p>Active Branches</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-success text-white"><Users size={24} /></div><div className="stat-content"><h3>{accounts.length}</h3><p>Staff Accounts</p></div></div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-lg-6"><div className="card h-100"><div className="card-header"><h4>Create Branch</h4></div><div className="card-body">
          <form onSubmit={createBranch}>
            <div className="mb-3"><label className="form-label">Branch Name</label><input className="form-control" required value={branchForm.name} onChange={(e)=>setBranchForm((p)=>({...p,name:e.target.value}))} /></div>
            <div className="mb-3"><label className="form-label">Address</label><input className="form-control" value={branchForm.address} onChange={(e)=>setBranchForm((p)=>({...p,address:e.target.value}))} /></div>
            <div className="mb-3"><label className="form-label">Phone</label><input className="form-control" value={branchForm.phone} onChange={(e)=>setBranchForm((p)=>({...p,phone:e.target.value}))} /></div>
            <button className="btn btn-primary" disabled={savingBranch}>{savingBranch ? 'Creating...' : 'Create Branch'}</button>
          </form>
        </div></div></div>

        <div className="col-lg-6"><div className="card h-100"><div className="card-header"><h4>Create Staff Account</h4></div><div className="card-body">
          <form onSubmit={createAccount}>
            <div className="mb-3"><label className="form-label">Select Staff</label><select className="form-select" required value={accountForm.staff_profile_id} onChange={(e)=>onStaffSelect(e.target.value)}><option value="">Select staff profile</option>{availableStaff.map((s)=><option key={s.id} value={s.id}>{s.full_name} • {s.job_title || s.role_preference}</option>)}</select></div>
            <div className="row g-2">
              <div className="col-md-6 mb-3"><label className="form-label">Username</label><input className="form-control" required value={accountForm.username} onChange={(e)=>setAccountForm((p)=>({...p,username:e.target.value}))} /></div>
              <div className="col-md-6 mb-3"><label className="form-label">Password</label><input type="password" minLength={6} className="form-control" required value={accountForm.password} onChange={(e)=>setAccountForm((p)=>({...p,password:e.target.value}))} /></div>
            </div>
            <div className="row g-2">
              <div className="col-md-6 mb-3"><label className="form-label">Account Role</label><select className="form-select" value={accountForm.role} onChange={(e)=>setAccountForm((p)=>({...p,role:e.target.value}))}><option value="cashier">Cashier</option><option value="manager">Ground Manager</option></select></div>
              <div className="col-md-6 mb-3"><label className="form-label">Branch</label><select className="form-select" required value={accountForm.location_id} onChange={(e)=>setAccountForm((p)=>({...p,location_id:e.target.value}))}><option value="">Select branch</option>{locations.map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            </div>
            <button className="btn btn-success" disabled={savingAccount || !availableStaff.length}><UserPlus size={16} /> {savingAccount ? 'Creating...' : 'Create Account'}</button>
          </form>
        </div></div></div>
      </div>

      <div className="card mb-4"><div className="card-header"><h4>Branches</h4></div><div className="card-body table-container">
        <table className="table"><thead><tr><th>Name</th><th>Address</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {locations.map((b) => <tr key={b.id}><td>{b.name}</td><td>{b.address || '—'}</td><td>{b.phone || '—'}</td><td><span className={`badge ${b.is_active ? 'badge-success':'badge-warning'}`}>{b.is_active ? 'Active':'Inactive'}</span></td><td style={{ display:'flex', gap:'0.5rem' }}><button className="btn btn-sm btn-secondary" onClick={()=>editBranch(b)}>Edit</button><button className="btn btn-sm btn-danger" onClick={()=>deleteBranch(b)}>Delete</button></td></tr>)}
        </tbody></table>
      </div></div>

      <div className="card"><div className="card-header"><h4>Account Directory</h4></div><div className="card-body table-container">
        <table className="table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {accounts.map((user) => <tr key={user.id}><td>{user.full_name || user.username}</td><td>{user.username}</td><td>{user.job_title || user.role}</td><td>{user.location_name || user.location_id}</td><td><span className={`badge ${user.is_active ? 'badge-success':'badge-warning'}`}>{user.is_active ? 'Active':'Inactive'}</span></td><td style={{ display:'flex', gap:'0.5rem' }}><button className="btn btn-sm btn-secondary" onClick={()=>editAccount(user)}>Edit</button><button className={`btn btn-sm ${user.is_active ? 'btn-danger':'btn-success'}`} onClick={()=>toggleAccountStatus(user)}>{user.is_active ? 'Disable':'Enable'}</button><button className="btn btn-sm btn-danger" onClick={()=>deleteAccount(user)}>Delete</button></td></tr>)}
        </tbody></table>
      </div></div>
    </div>
  );
}
