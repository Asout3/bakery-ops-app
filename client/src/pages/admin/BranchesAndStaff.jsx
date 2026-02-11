import { useEffect, useMemo, useState } from 'react';
import { Building2, UserPlus, Users } from 'lucide-react';
import api from '../../api/axios';

const emptyBranch = { name: '', address: '', phone: '' };
const emptyStaff = {
  username: '',
  email: '',
  password: '',
  role: 'cashier',
  location_id: '',
};

export default function BranchesAndStaff() {
  const [locations, setLocations] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchForm, setBranchForm] = useState(emptyBranch);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);

  const activeStaff = useMemo(() => staff.filter((u) => u.is_active), [staff]);

  const loadData = async () => {
    try {
      const [locationsRes, staffRes] = await Promise.all([
        api.get('/locations'),
        api.get('/admin/users'),
      ]);
      setLocations(locationsRes.data || []);
      setStaff(staffRes.data || []);
    } catch (err) {
      console.error('Failed to load branch/staff data', err);
      window.alert(err.response?.data?.error || 'Failed to load branch/staff data');
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
      if (!staffForm.location_id && response.data?.id) {
        setStaffForm((prev) => ({ ...prev, location_id: String(response.data.id) }));
      }
    } catch (err) {
      window.alert(err.response?.data?.error || 'Could not create branch');
    } finally {
      setSavingBranch(false);
    }
  };

  const createStaff = async (e) => {
    e.preventDefault();
    setSavingStaff(true);
    try {
      const payload = { ...staffForm, location_id: Number(staffForm.location_id) };
      const response = await api.post('/admin/users', payload);
      setStaff([response.data, ...staff]);
      setStaffForm({ ...emptyStaff, location_id: staffForm.location_id });
    } catch (err) {
      window.alert(err.response?.data?.error || 'Could not create staff member');
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
    } catch (err) {
      window.alert(err.response?.data?.error || 'Could not update staff status');
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
        <h2>Branches & Staff Setup</h2>
      </div>

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
                  <input
                    className="form-control"
                    required
                    value={branchForm.name}
                    onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Downtown Branch"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Address</label>
                  <input
                    className="form-control"
                    value={branchForm.address}
                    onChange={(e) => setBranchForm((p) => ({ ...p, address: e.target.value }))}
                    placeholder="Street, city"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Phone</label>
                  <input
                    className="form-control"
                    value={branchForm.phone}
                    onChange={(e) => setBranchForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="+1 555 0123"
                  />
                </div>
                <button className="btn btn-primary" disabled={savingBranch}>
                  <Building2 size={16} /> {savingBranch ? 'Creating...' : 'Create Branch'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card">
            <div className="card-header"><h4>Add Cashier / Manager</h4></div>
            <div className="card-body">
              <form onSubmit={createStaff}>
                <div className="mb-3">
                  <label className="form-label">Username</label>
                  <input
                    className="form-control"
                    required
                    value={staffForm.username}
                    onChange={(e) => setStaffForm((p) => ({ ...p, username: e.target.value }))}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    required
                    value={staffForm.email}
                    onChange={(e) => setStaffForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="row g-2">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Role</label>
                    <select
                      className="form-select"
                      value={staffForm.role}
                      onChange={(e) => setStaffForm((p) => ({ ...p, role: e.target.value }))}
                    >
                      <option value="cashier">Cashier</option>
                      <option value="manager">Manager</option>
                    </select>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Branch</label>
                    <select
                      className="form-select"
                      required
                      value={staffForm.location_id}
                      onChange={(e) => setStaffForm((p) => ({ ...p, location_id: e.target.value }))}
                    >
                      <option value="">Select branch</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>{location.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-control"
                    required
                    minLength={6}
                    value={staffForm.password}
                    onChange={(e) => setStaffForm((p) => ({ ...p, password: e.target.value }))}
                  />
                </div>

                <button className="btn btn-success" disabled={savingStaff || !locations.length}>
                  <UserPlus size={16} /> {savingStaff ? 'Creating...' : 'Create Staff Account'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h4>Staff Directory</h4>
        </div>
        <div className="card-body table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {staff.filter((u) => ['cashier', 'manager'].includes(u.role)).map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td><span className={`badge ${user.role === 'manager' ? 'badge-info' : 'badge-secondary'}`}>{user.role}</span></td>
                  <td>{user.location_name || user.location_id || '—'}</td>
                  <td>
                    <span className={`badge ${user.is_active ? 'badge-success' : 'badge-warning'}`}>
                      {user.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${user.is_active ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => toggleUserStatus(user)}
                    >
                      {user.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
