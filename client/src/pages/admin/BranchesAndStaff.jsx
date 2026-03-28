import { useEffect, useState } from 'react';
import './BranchesAndStaff.css';
import { UserPlus, Users, Eye, EyeOff } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';

const emptyAccount = {
  staff_profile_id: '',
  username: '',
  password: '',
  role: 'cashier',
};

const ROLE_LABELS = {
  cashier: 'Cashier',
  manager: 'Ground Manager',
};

export default function BranchesAndStaff() {
  const { user, updateSession } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [staffProfiles, setStaffProfiles] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [authEvents, setAuthEvents] = useState([]);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [savingAccount, setSavingAccount] = useState(false);
  const [editAccountModel, setEditAccountModel] = useState(null);
  const [credentialForm, setCredentialForm] = useState({ current_password: '', new_username: '', new_password: '' });
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialConfirmPassword, setCredentialConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    createAccount: false,
    editAccount: false,
    currentCredential: true,
    newCredential: false,
    confirmCredential: false,
  });
  const [credentialConfirmModal, setCredentialConfirmModal] = useState({ open: false, payload: null, message: '' });
  const toast = useToast();


  const togglePasswordVisibility = (key) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const loadData = async () => {
    try {
      const [staffRes, accountsRes, loginEventsRes, logoutEventsRes] = await Promise.all([
        api.get('/admin/staff').catch(() => ({ data: [] })),
        api.get('/admin/users').catch(() => ({ data: [] })),
        api.get('/activity', { params: { limit: 50, activity_type: 'user_login' } }).catch(() => ({ data: [] })),
        api.get('/activity', { params: { limit: 50, activity_type: 'user_logout' } }).catch(() => ({ data: [] })),
      ]);
      setStaffProfiles(staffRes.data || []);
      setAccounts(accountsRes.data || []);
      const events = [...(loginEventsRes.data || []), ...(logoutEventsRes.data || [])]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 40);
      setAuthEvents(events);
    } catch (err) {
toast.error(err.response?.data?.error || 'Failed to load branch/account data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showFeedback = (type, message) => {
    if (type === 'success') toast.success(message);
    else if (type === 'warning') toast.warning(message);
    else if (type === 'info') toast.info(message);
    else toast.error(message);
  };

  const createAccount = async (e) => {
    e.preventDefault();
    setSavingAccount(true);
    try {
      if (!accountForm.staff_profile_id || !accountForm.username || !accountForm.password) {
        showFeedback('danger', 'Please fill all required account fields.');
        setSavingAccount(false);
        return;
      }
      
      const strongPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
      if (!strongPassword.test(accountForm.password)) {
        showFeedback('danger', 'Password must be at least 8 characters and include a letter, number, and special character.');
        setSavingAccount(false);
        return;
      }

      const payload = {
        ...accountForm,
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
      role: defaultRole
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


  const editAccount = async (user) => {
    setEditAccountModel({ ...user, password: '' });
  };

  const saveAccountEdit = async () => {
    try {
      const payload = {
        username: editAccountModel.username,
      };
      
      if (editAccountModel.password) {
        const strongPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
        if (!strongPassword.test(editAccountModel.password)) {
          showFeedback('danger', 'Password must be at least 8 characters and include a letter, number, and special character.');
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
        const strongPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
        if (!strongPassword.test(credentialForm.new_password)) {
          showFeedback('danger', 'New password must be at least 8 characters and include a letter, number, and special character.');
          return;
        }
        if (credentialForm.new_password !== credentialConfirmPassword) {
          showFeedback('danger', 'New password and confirmation do not match.');
          return;
        }
        payload.new_password = credentialForm.new_password;
      }

      if (!payload.new_username && !payload.new_password) {
        showFeedback('danger', 'Provide a new username or new password.');
        return;
      }

      const confirmMessage = payload.new_username && payload.new_password
        ? 'You are about to update both username and password. Continue?'
        : payload.new_username
          ? `You are about to change username to "${payload.new_username}". Continue?`
          : 'You are about to change your password. Continue?';

      setCredentialConfirmModal({ open: true, payload, message: confirmMessage });
    } catch (err) {
      const validationText = err.response?.data?.details?.map((x) => x.msg).join(', ');
      showFeedback('danger', validationText || err.response?.data?.error || 'Could not prepare credentials update');
      setSavingCredentials(false);
    }
  };


  const confirmCredentialUpdate = async () => {
    if (!credentialConfirmModal.payload) {
      setCredentialConfirmModal({ open: false, payload: null, message: '' });
      setSavingCredentials(false);
      return;
    }

    try {
      const res = await api.post('/auth/change-credentials', credentialConfirmModal.payload);
      if (res.data?.token && res.data?.user) {
        updateSession(res.data.user, res.data.token);
      }
      setCredentialForm({ current_password: '', new_username: '', new_password: '' });
      setCredentialConfirmPassword('');
      showFeedback('success', 'Credentials updated successfully.');
      setCredentialConfirmModal({ open: false, payload: null, message: '' });
    } catch (err) {
      const validationText = err.response?.data?.details?.map((x) => x.msg).join(', ');
      const apiCode = err.response?.data?.code;
      const fallbackMessage = apiCode === 'AUTH_INVALID_CURRENT_PASSWORD'
        ? 'Current password is incorrect. Please enter your latest password.'
        : err.response?.data?.error || 'Could not update credentials';
      showFeedback('danger', validationText || fallbackMessage);
      setCredentialConfirmModal({ open: false, payload: null, message: '' });
    } finally {
      setSavingCredentials(false);
    }
  };

  const availableStaff = staffProfiles.filter((s) => s.is_active && !s.linked_user_id && ['cashier', 'manager'].includes(s.role_preference));

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header"><h2>{t('accountManagement')}</h2></div>

      <div className="stats-grid mb-4">
        <div className="stat-card card"><div className="stat-icon bg-success text-white"><Users size={24} /></div><div className="stat-content"><h3>{accounts.filter(a => a.is_active).length}</h3><p>Active Accounts</p></div></div>
        <div className="stat-card card"><div className="stat-icon bg-warning text-white"><UserPlus size={24} /></div><div className="stat-content"><h3>{availableStaff.length}</h3><p>Staff Without Account</p></div></div>
      </div>

      <div className="card mb-4 border-0 shadow-sm"><div className="card-header bg-dark text-white"><h4 className="mb-0">My Admin Credentials</h4></div><div className="card-body">
        <form onSubmit={updateOwnCredentials}>
          <div className="row g-4 align-items-end">
            <div className="col-lg-6 col-md-6">
              <label className="form-label fw-semibold">Current Password *</label>
              <div className="input-group"><input type={showPasswords.currentCredential ? "text" : "password"} className="form-control" value={credentialForm.current_password} onChange={(e)=>setCredentialForm((p)=>({...p,current_password:e.target.value}))} required /><button type="button" className="btn btn-outline-secondary" onClick={()=>togglePasswordVisibility("currentCredential")}>{showPasswords.currentCredential ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            </div>
            <div className="col-lg-6 col-md-6">
              <label className="form-label fw-semibold">New Username</label>
              <input className="form-control" value={credentialForm.new_username} onChange={(e)=>setCredentialForm((p)=>({...p,new_username:e.target.value}))} placeholder={user?.username || 'New username'} />
            </div>
            <div className="col-lg-6 col-md-6">
              <label className="form-label fw-semibold">New Password</label>
              <div className="input-group"><input type={showPasswords.newCredential ? "text" : "password"} className="form-control" minLength={8} value={credentialForm.new_password} onChange={(e)=>setCredentialForm((p)=>({...p,new_password:e.target.value}))} placeholder="Leave blank to keep password" /><button type="button" className="btn btn-outline-secondary" onClick={()=>togglePasswordVisibility("newCredential")}>{showPasswords.newCredential ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            </div>
            <div className="col-lg-6 col-md-6">
              <label className="form-label fw-semibold">Confirm New Password</label>
              <div className="input-group"><input type={showPasswords.confirmCredential ? "text" : "password"} className="form-control" minLength={8} value={credentialConfirmPassword} onChange={(e)=>setCredentialConfirmPassword(e.target.value)} placeholder="Retype new password" /><button type="button" className="btn btn-outline-secondary" onClick={()=>togglePasswordVisibility("confirmCredential")}>{showPasswords.confirmCredential ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            </div>
          </div>
          <div className="mt-3 d-flex flex-wrap align-items-center gap-2">
            <button className="btn btn-dark px-4" disabled={savingCredentials}>{savingCredentials ? 'Saving...' : 'Update My Credentials'}</button>
            <small className="text-muted">You can update username, password, or both. Passwords must include letter, number, and special character.</small>
          </div>
        </form>
      </div></div>

      <div className="row g-4 mb-4">

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
                    {s.full_name} • {s.job_title || s.role_preference}
                  </option>
                ))}
              </select>
              <small className="text-muted">Staff with role "other" (bakers, cleaners, etc.) typically don't need accounts</small>
            </div>
            <div className="row g-2">
              <div className="col-md-6 mb-3"><label className="form-label">Username *</label><input className="form-control" required value={accountForm.username} onChange={(e)=>setAccountForm((p)=>({...p,username:e.target.value}))} placeholder="Login username" /></div>
              <div className="col-md-6 mb-3"><label className="form-label">Password *</label><div className="input-group"><input type={showPasswords.createAccount ? "text" : "password"} minLength={8} className="form-control" required value={accountForm.password} onChange={(e)=>setAccountForm((p)=>({...p,password:e.target.value}))} placeholder="Min 8 characters, include letter/number/special" /><button type="button" className="btn btn-outline-secondary" onClick={()=>togglePasswordVisibility("createAccount")}>{showPasswords.createAccount ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
            </div>
            <div className="row g-2">
              <div className="col-md-6 mb-3"><label className="form-label">Account Role *</label><input className="form-control" value={ROLE_LABELS[accountForm.role] || accountForm.role} disabled /></div>
            </div>
            <button className="btn btn-success" disabled={savingAccount}><UserPlus size={16} className="me-1" /> {savingAccount ? 'Creating...' : 'Create Account'}</button>
          </form>
          )}
        </div></div></div>
      </div>

      <div className="card"><div className="card-header"><h4>Account Directory</h4></div><div className="card-body table-container">
        {accounts.length === 0 ? (
          <p className="text-muted">No accounts created yet.</p>
        ) : (
        <>
        <h5 className="mb-2">Active Accounts</h5><table className="table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {accounts.filter((a)=>a.is_active).map((user) => <tr key={user.id}>
            <td>{user.full_name || user.username}</td>
            <td>{user.username}</td>
            <td><span className={`badge ${user.role === 'manager' ? 'badge-primary' : 'badge-info'}`}>{ROLE_LABELS[user.role] || user.role}</span></td>
            
            <td><span className={`badge ${user.is_active ? 'badge-success':'badge-warning'}`}>{user.is_active ? 'Active':'Inactive'}</span></td>
            <td style={{ display:'flex', gap:'0.5rem' }}>
              <button className="btn btn-sm btn-secondary" onClick={()=>editAccount(user)}>Edit</button>
              <button className={`btn btn-sm ${user.is_active ? 'btn-warning':'btn-success'}`} onClick={()=>toggleAccountStatus(user)}>{user.is_active ? 'Disable':'Enable'}</button>
              <button className="btn btn-sm btn-danger" onClick={()=>deleteAccount(user)}>Delete</button>
            </td>
          </tr>)}
        </tbody></table><h5 className="mt-4 mb-2">Inactive Accounts</h5><table className="table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{accounts.filter((a)=>!a.is_active).map((user) => <tr key={`inactive-${user.id}`}><td>{user.full_name || user.username}</td><td>{user.username}</td><td><span className={`badge ${user.role === 'manager' ? 'badge-primary' : 'badge-info'}`}>{ROLE_LABELS[user.role] || user.role}</span></td><td><span className="badge badge-warning">Inactive</span></td><td style={{ display:'flex', gap:'0.5rem' }}><button className="btn btn-sm btn-secondary" onClick={()=>editAccount(user)}>Edit</button><button className="btn btn-sm btn-success" onClick={()=>toggleAccountStatus(user)}>Enable</button><button className="btn btn-sm btn-danger" onClick={()=>deleteAccount(user)}>Delete</button></td></tr>)}{!accounts.filter((a)=>!a.is_active).length && <tr><td colSpan={5} className="text-muted text-center">No inactive accounts.</td></tr>}</tbody></table>
        </>
        )}
      </div></div>


      {credentialConfirmModal.open && (
        <div className="modal-overlay" onClick={() => { setCredentialConfirmModal({ open: false, payload: null, message: '' }); setSavingCredentials(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Confirm Credential Update</h3><button className="close-btn" onClick={() => { setCredentialConfirmModal({ open: false, payload: null, message: '' }); setSavingCredentials(false); }}>×</button></div>
            <div className="modal-body">
              <p className="mb-3">{credentialConfirmModal.message}</p>
              <div className="alert alert-warning mb-3">You will need to use your new credentials on next login.</div>
              <div className="d-flex gap-2">
                <button className="btn btn-primary" onClick={confirmCredentialUpdate}>Yes, Update</button>
                <button className="btn btn-secondary" onClick={() => { setCredentialConfirmModal({ open: false, payload: null, message: '' }); setSavingCredentials(false); }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}





      <div className="card mt-4"><div className="card-header"><h4>Login & Logout Activity</h4></div><div className="card-body table-container"><div className="table-responsive"><table className="table table-hover"><thead><tr><th>User</th><th>Role</th><th>Action</th><th>Time</th><th>Description</th></tr></thead><tbody>{authEvents.map((event) => (<tr key={`${event.id}-${event.activity_type}`}><td>{event.username}</td><td>{accounts.find((u) => Number(u.id) === Number(event.user_id))?.role || '-'}</td><td><span className={`badge ${event.activity_type === 'user_login' ? 'badge-success' : 'badge-secondary'}`}>{event.activity_type === 'user_login' ? 'Login' : 'Logout'}</span></td><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.description}</td></tr>))}{!authEvents.length && <tr><td colSpan={5} className="text-center text-muted">No login/logout records yet.</td></tr>}</tbody></table></div></div></div>

      {editAccountModel && (
        <div className="modal-overlay" onClick={() => setEditAccountModel(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Edit Account</h3><button className="close-btn" onClick={() => setEditAccountModel(null)}>×</button></div>
            <div className="modal-body">
              <div className="mb-3"><label className="form-label">Username</label><input className="form-control" value={editAccountModel.username || ''} onChange={(e)=>setEditAccountModel((p)=>({...p,username:e.target.value}))} /></div>
              <div className="mb-3"><label className="form-label">Role</label>
                <input className="form-control" value={ROLE_LABELS[editAccountModel.role] || editAccountModel.role} disabled readOnly />
                <small className="text-muted">Role is locked after account creation.</small>
              </div>

              <div className="mb-3"><label className="form-label">New Password (leave blank to keep current)</label><div className="input-group"><input type={showPasswords.editAccount ? "text" : "password"} className="form-control" value={editAccountModel.password || ''} onChange={(e)=>setEditAccountModel((p)=>({...p,password:e.target.value}))} placeholder="Min 8 characters, include letter/number/special" /><button type="button" className="btn btn-outline-secondary" onClick={()=>togglePasswordVisibility("editAccount")}>{showPasswords.editAccount ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
              <div className="d-flex gap-2"><button className="btn btn-primary" onClick={saveAccountEdit}>Save</button><button className="btn btn-secondary" onClick={() => setEditAccountModel(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
