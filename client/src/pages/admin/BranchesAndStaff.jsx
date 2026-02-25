import { useEffect, useState } from 'react';
import { Building2, UserPlus, Users } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

const emptyBranch = { name: '', address: '', phone: '' };
const emptyAccount = {
  staff_profile_id: '',
  username: '',
  password: '',
  role: 'cashier',
  location_id: '',
};

const ROLE_LABELS = {
  cashier: 'Cashier',
  manager: 'Ground Manager',
};

export default function BranchesAndStaff() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [staffProfiles, setStaffProfiles] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [branchForm, setBranchForm] = useState(emptyBranch);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [editBranchModel, setEditBranchModel] = useState(null);
  const [editAccountModel, setEditAccountModel] = useState(null);
  const [credentialForm, setCredentialForm] = useState({ current_password: '', new_username: '', new_password: '' });
  const [savingCredentials, setSavingCredentials] = useState(false);

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

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const createBranch = async (e) => {
    e.preventDefault();
    setSavingBranch(true);
    try {
      await api.post('/locations', branchForm);
      setBranchForm(emptyBranch);
      showFeedback('success', 'Branch created successfully.');
      loadData();
    } catch (err) {
      showFeedback('danger', err.response?.data?.error || 'Could not create branch');
    } finally {
      setSavingBranch(false);
    }
  };

  const createAccount = async (e) => {
    e.preventDefault();
    setSavingAccount(true);
    try {
      if (!accountForm.staff_profile_id || !accountForm.location_id || !accountForm.username || !accountForm.password) {
        showFeedback('danger', 'Please fill all required account fields.');
        setSavingAccount(false);
        return;
      }
      
      if (accountForm.password.length < 8) {
        showFeedback('danger', 'Password must be at least 8 characters.');
        setSavingAccount(false);
        return;
      }

      const payload = {
        ...accountForm,
        location_id: Number(accountForm.location_id),
        staff_profile_id: Number(accountForm.staff_profile_id),
      };

      try {
        await api.post('/admin/users', payload);
        showFeedback('success', 'Staff account created successfully.');
        setAccountForm(emptyAccount);
        loadData();
      } catch (err) {
        if (err.response?.data?.code === 'ARCHIVED_ACCOUNT_EXISTS_RECONFIRM') {
          const archivedUsername = accountForm.username;
          const confirmReactivate = window.confirm(
            `An archived account "${archivedUsername}" already exists. Do you want to reactivate this account with the new details?`
          );
          if (confirmReactivate) {
            payload.reactivate_confirm = true;
            await api.post('/admin/users', payload);
            showFeedback('success', `Staff account "${archivedUsername}" reactivated successfully.`);
            setAccountForm(emptyAccount);
            loadData();
          } else {
            showFeedback('info', 'Account reactivation cancelled.');
          }
        } else {
          const validationText = err.response?.data?.errors?.map((x) => x.msg).join(', ');
          showFeedback('danger', validationText || err.response?.data?.error || 'Could not create staff account');
        }
      }
    } catch (err) {
      showFeedback('danger', err.response?.data?.error || 'An unexpected error occurred');
    } finally {
      setSavingAccount(false);
    }
  };

  const onStaffSelect = (staffId) => {
    const selected = staffProfiles.find((s) => Number(s.id) === Number(staffId));
    if (!selected) return;
    
    let defaultRole = 'cashier';
    if (selected.role_preference === 'manager') {
      defaultRole = 'manager';
    }
    
    setAccountForm((p) => ({
      ...p,
      staff_profile_id: staffId,
      role: defaultRole,
      location_id: selected.location_id ? String(selected.location_id) : p.location_id,
    }));
  };

  const toggleAccountStatus = async (user) => {
    try {
      await api.patch(`/admin/users/${user.id}/status`, { is_active: !user.is_active });
      showFeedback('success', `Account ${!user.is_active ? 'enabled' : 'disabled'} successfully.`);
      loadData();
    } catch (err) {
      showFeedback('danger', err.response?.data?.error || 'Could not update account status');
    }
  };

  const editBranch = async (branch) => {
    setEditBranchModel({ ...branch });
  };

  const saveBranchEdit = async () => {
    try {
      await api.put(`/locations/${editBranchModel.id}`, editBranchModel);
      showFeedback('success', 'Branch updated.');
      setEditBranchModel(null);
      loadData();
    } catch (err) {
      showFeedback('danger', err.response?.data?.error || 'Could not update branch');
    }
  };

  const deleteBranch = async (branch) => {
    if (!window.confirm(`Delete/disable branch "${branch.name}"?`)) return;
    try {
      const res = await api.delete(`/locations/${branch.id}`);
      showFeedback('success', res.data?.message || 'Branch removed.');
      loadData();
    } catch (err) {
      showFeedback('danger', err.response?.data?.error || 'Could not remove branch');
    }
  };

  const editAccount = async (user) => {
    setEditAccountModel({ ...user, password: '' });
  };

  const saveAccountEdit = async () => {
    try {
      const payload = {
        username: editAccountModel.username,
        role: editAccountModel.role,
        location_id: Number(editAccountModel.location_id),
      };
      
      if (editAccountModel.password) {
        if (editAccountModel.password.length < 8) {
          showFeedback('danger', 'Password must be at least 8 characters.');
          return;
        }
        payload.password = editAccountModel.password;
      }
      
      await api.put(`/admin/users/${editAccountModel.id}`, payload);
      showFeedback('success', 'Account updated.');
      setEditAccountModel(null);
      loadData();
    } catch (err) {
      showFeedback('danger', err.response?.data?.error || 'Could not update account');
    }
  };

  const deleteAccount = async (user) => {
    if (!window.confirm(`Delete account ${user.username}? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/users/${user.id}`);
      showFeedback('success', 'Account deleted.');
      loadData();
    } catch (err) {
      showFeedback('danger', err.response?.data?.error || 'Could not delete account');
    }
  };

  const updateOwnCredentials = async (e) => {
    e.preventDefault();
    setSavingCredentials(true);
    try {
      if (!credentialForm.current_password) {
        showFeedback('danger', 'Current password is required.');
        return;
      }

      const payload = {
        current_password: credentialForm.current_password,
      };

      if (credentialForm.new_username?.trim()) {
        payload.new_username = credentialForm.new_username.trim();
      }

      if (credentialForm.new_password) {
        if (credentialForm.new_password.length < 8) {
          showFeedback('danger', 'New password must be at least 8 characters.');
          return;
        }
        payload.new_password = credentialForm.new_password;
      }

      if (!payload.new_username && !payload.new_password) {
        showFeedback('danger', 'Provide a new username or new password.');
        return;
      }

      const confirmMessage = payload.new_username && payload.new_password
        ? 'Are you sure you want to change both your username and password?'
        : payload.new_username
          ? `Are you sure you want to change your username to "${payload.new_username}"?`
          : 'Are you sure you want to change your password?';

      if (!window.confirm(confirmMessage)) {
        showFeedback('info', 'Credentials update cancelled.');
        return;
      }

      const res = await api.post('/auth/change-credentials', payload);
      if (res.data?.token && res.data?.user) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
      }
      setCredentialForm({ current_password: '', new_username: '', new_password: '' });
      showFeedback('success', 'Credentials updated successfully. Please continue with the new username/password.');
      if (payload.new_username) {
        window.location.reload();
      }
    } catch (err) {
      const validationText = err.response?.data?.details?.map((x) => x.msg).join(', ');
      showFeedback('danger', validationText || err.response?.data?.error || 'Could not update credentials');
    } finally {
      setSavingCredentials(false);
    }
  };

  const availableStaff = staffProfiles.filter((s) => s.is_active && !s.linked_user_id);

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header"><h2>Branch & Account Management</h2></div>
      {feedback && <div className={`alert alert-${feedback.type} mb-4`}>{feedback.message}</div>}

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light"><div className="stat-icon bg-primary text-white"><Building2 size={24} /></div><div className="stat-content"><h3>{locations.filter(l => l.is_active).length}</h3><p>Active Branches</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-success text-white"><Users size={24} /></div><div className="stat-content"><h3>{accounts.filter(a => a.is_active).length}</h3><p>Active Accounts</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-warning text-white"><UserPlus size={24} /></div><div className="stat-content"><h3>{availableStaff.length}</h3><p>Staff Without Account</p></div></div>
      </div>

      <div className="card mb-4 border-0 shadow-sm"><div className="card-header bg-dark text-white"><h4 className="mb-0">My Admin Credentials</h4></div><div className="card-body">
        <form onSubmit={updateOwnCredentials}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Current Password *</label>
              <input type="password" className="form-control" value={credentialForm.current_password} onChange={(e)=>setCredentialForm((p)=>({...p,current_password:e.target.value}))} required />
            </div>
            <div className="col-md-4">
              <label className="form-label">New Username</label>
              <input className="form-control" value={credentialForm.new_username} onChange={(e)=>setCredentialForm((p)=>({...p,new_username:e.target.value}))} placeholder={user?.username || 'New username'} />
            </div>
            <div className="col-md-4">
              <label className="form-label">New Password</label>
              <input type="password" className="form-control" minLength={8} value={credentialForm.new_password} onChange={(e)=>setCredentialForm((p)=>({...p,new_password:e.target.value}))} placeholder="Leave blank to keep password" />
            </div>
          </div>
          <div className="mt-3 d-flex flex-wrap align-items-center gap-2">
            <button className="btn btn-dark px-4" disabled={savingCredentials}>{savingCredentials ? 'Saving...' : 'Update My Credentials'}</button>
            <small className="text-muted">You can update username, password, or both. You will be asked to confirm before saving.</small>
          </div>
        </form>
      </div></div>

      <div className="row g-4 mb-4">
        <div className="col-lg-6"><div className="card h-100"><div className="card-header"><h4>Create Branch</h4></div><div className="card-body">
          <form onSubmit={createBranch}>
            <div className="mb-3"><label className="form-label">Branch Name *</label><input className="form-control" required value={branchForm.name} onChange={(e)=>setBranchForm((p)=>({...p,name:e.target.value}))} placeholder="Enter branch name" /></div>
            <div className="mb-3"><label className="form-label">Address</label><input className="form-control" value={branchForm.address} onChange={(e)=>setBranchForm((p)=>({...p,address:e.target.value}))} placeholder="Enter address" /></div>
            <div className="mb-3"><label className="form-label">Phone</label><input className="form-control" value={branchForm.phone} onChange={(e)=>setBranchForm((p)=>({...p,phone:e.target.value}))} placeholder="Enter phone number" /></div>
            <button className="btn btn-primary" disabled={savingBranch}>{savingBranch ? 'Creating...' : 'Create Branch'}</button>
          </form>
        </div></div></div>

        <div className="col-lg-6"><div className="card h-100"><div className="card-header"><h4>Create Staff Account</h4></div><div className="card-body">
          {availableStaff.length === 0 ? (
            <div className="alert alert-info">
              No staff members available for account creation. Add staff profiles first in Staff Management.
            </div>
          ) : (
          <form onSubmit={createAccount}>
            <div className="mb-3">
              <label className="form-label">Select Staff *</label>
              <select className="form-select" required value={accountForm.staff_profile_id} onChange={(e)=>onStaffSelect(e.target.value)}>
                <option value="">Select staff profile</option>
                {availableStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} • {s.job_title || s.role_preference} {s.role_preference === 'other' ? '(Non-account staff)' : ''}
                  </option>
                ))}
              </select>
              <small className="text-muted">Staff with role "other" (bakers, cleaners, etc.) typically don't need accounts</small>
            </div>
            <div className="row g-2">
              <div className="col-md-6 mb-3"><label className="form-label">Username *</label><input className="form-control" required value={accountForm.username} onChange={(e)=>setAccountForm((p)=>({...p,username:e.target.value}))} placeholder="Login username" /></div>
              <div className="col-md-6 mb-3"><label className="form-label">Password *</label><input type="password" minLength={8} className="form-control" required value={accountForm.password} onChange={(e)=>setAccountForm((p)=>({...p,password:e.target.value}))} placeholder="Min 8 characters" /></div>
            </div>
            <div className="row g-2">
              <div className="col-md-6 mb-3"><label className="form-label">Account Role *</label>
                <select className="form-select" value={accountForm.role} onChange={(e)=>setAccountForm((p)=>({...p,role:e.target.value}))}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 mb-3"><label className="form-label">Branch *</label><select className="form-select" required value={accountForm.location_id} onChange={(e)=>setAccountForm((p)=>({...p,location_id:e.target.value}))}><option value="">Select branch</option>{locations.filter(l => l.is_active).map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            </div>
            <button className="btn btn-success" disabled={savingAccount}><UserPlus size={16} className="me-1" /> {savingAccount ? 'Creating...' : 'Create Account'}</button>
          </form>
          )}
        </div></div></div>
      </div>

      <div className="card mb-4"><div className="card-header"><h4>Branches</h4></div><div className="card-body table-container">
        {locations.length === 0 ? (
          <p className="text-muted">No branches created yet.</p>
        ) : (
        <table className="table"><thead><tr><th>Name</th><th>Address</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {locations.map((b) => <tr key={b.id}><td>{b.name}</td><td>{b.address || '—'}</td><td>{b.phone || '—'}</td><td><span className={`badge ${b.is_active ? 'badge-success':'badge-warning'}`}>{b.is_active ? 'Active':'Inactive'}</span></td><td style={{ display:'flex', gap:'0.5rem' }}><button className="btn btn-sm btn-secondary" onClick={()=>editBranch(b)}>Edit</button><button className="btn btn-sm btn-danger" onClick={()=>deleteBranch(b)}>{b.is_active ? 'Disable' : 'Delete'}</button></td></tr>)}
        </tbody></table>
        )}
      </div></div>

      <div className="card"><div className="card-header"><h4>Account Directory</h4></div><div className="card-body table-container">
        {accounts.length === 0 ? (
          <p className="text-muted">No accounts created yet.</p>
        ) : (
        <table className="table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {accounts.map((user) => <tr key={user.id}>
            <td>{user.full_name || user.username}</td>
            <td>{user.username}</td>
            <td><span className={`badge ${user.role === 'manager' ? 'badge-primary' : 'badge-info'}`}>{ROLE_LABELS[user.role] || user.role}</span></td>
            <td>{user.location_name || '—'}</td>
            <td><span className={`badge ${user.is_active ? 'badge-success':'badge-warning'}`}>{user.is_active ? 'Active':'Inactive'}</span></td>
            <td style={{ display:'flex', gap:'0.5rem' }}>
              <button className="btn btn-sm btn-secondary" onClick={()=>editAccount(user)}>Edit</button>
              <button className={`btn btn-sm ${user.is_active ? 'btn-warning':'btn-success'}`} onClick={()=>toggleAccountStatus(user)}>{user.is_active ? 'Disable':'Enable'}</button>
              <button className="btn btn-sm btn-danger" onClick={()=>deleteAccount(user)}>Delete</button>
            </td>
          </tr>)}
        </tbody></table>
        )}
      </div></div>

      {editBranchModel && (
        <div className="modal-overlay" onClick={() => setEditBranchModel(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Edit Branch</h3><button className="close-btn" onClick={() => setEditBranchModel(null)}>×</button></div>
            <div className="modal-body">
              <div className="mb-3"><label className="form-label">Name *</label><input className="form-control" value={editBranchModel.name || ''} onChange={(e)=>setEditBranchModel((p)=>({...p,name:e.target.value}))} /></div>
              <div className="mb-3"><label className="form-label">Address</label><input className="form-control" value={editBranchModel.address || ''} onChange={(e)=>setEditBranchModel((p)=>({...p,address:e.target.value}))} /></div>
              <div className="mb-3"><label className="form-label">Phone</label><input className="form-control" value={editBranchModel.phone || ''} onChange={(e)=>setEditBranchModel((p)=>({...p,phone:e.target.value}))} /></div>
              <div className="d-flex gap-2"><button className="btn btn-primary" onClick={saveBranchEdit}>Save</button><button className="btn btn-secondary" onClick={() => setEditBranchModel(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}

      {editAccountModel && (
        <div className="modal-overlay" onClick={() => setEditAccountModel(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Edit Account</h3><button className="close-btn" onClick={() => setEditAccountModel(null)}>×</button></div>
            <div className="modal-body">
              <div className="mb-3"><label className="form-label">Username</label><input className="form-control" value={editAccountModel.username || ''} onChange={(e)=>setEditAccountModel((p)=>({...p,username:e.target.value}))} /></div>
              <div className="mb-3"><label className="form-label">Role</label>
                <select className="form-select" value={editAccountModel.role} onChange={(e)=>setEditAccountModel((p)=>({...p,role:e.target.value}))}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="mb-3"><label className="form-label">Branch</label><select className="form-select" value={editAccountModel.location_id || ''} onChange={(e)=>setEditAccountModel((p)=>({...p,location_id:e.target.value}))}>{locations.filter(l => l.is_active).map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
              <div className="mb-3"><label className="form-label">New Password (leave blank to keep current)</label><input type="password" className="form-control" value={editAccountModel.password || ''} onChange={(e)=>setEditAccountModel((p)=>({...p,password:e.target.value}))} placeholder="Min 8 characters" /></div>
              <div className="d-flex gap-2"><button className="btn btn-primary" onClick={saveAccountEdit}>Save</button><button className="btn btn-secondary" onClick={() => setEditAccountModel(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
