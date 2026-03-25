import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import api, { getErrorMessage } from '../../api/axios';
import './Waste.css';

const formatMoney = (value) => `ETB ${Number(value || 0).toFixed(2)}`;

export default function WastePage() {
  const [wasteRows, setWasteRows] = useState([]);
  const [summary, setSummary] = useState({ daily_loss: 0, weekly_loss: 0, monthly_loss: 0, total_loss: 0, monthly_items: 0 });
  const [period, setPeriod] = useState('daily');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [reasonFilter, setReasonFilter] = useState('all');

  const loadWasteData = async () => {
    setError('');
    try {
      const [rowsRes, summaryRes] = await Promise.all([
        api.get('/waste', { params: { limit: 200 } }),
        api.get('/waste/summary'),
      ]);
      setWasteRows(rowsRes.data || []);
      setSummary(summaryRes.data || {});
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load waste data.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWasteData();
  }, []);

  const handleProcessExpired = async () => {
    setProcessing(true);
    try {
      await api.post('/waste/process-expired');
      await loadWasteData();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to process expired inventory.'));
    } finally {
      setProcessing(false);
    }
  };

  const groupedRows = useMemo(() => {
    const grouped = wasteRows.reduce((acc, row) => {
      const key = `${row.group_name}::${row.product_name}`;
      if (!acc[key]) {
        acc[key] = {
          key,
          label: `${row.group_name} / ${row.product_name}`,
          quantity: 0,
          totalLoss: 0,
          occurrences: 0,
          lastWastedAt: row.wasted_at,
          unit: row.unit,
        };
      }
      acc[key].quantity += Number(row.quantity_wasted || 0);
      acc[key].totalLoss += Number(row.total_loss || 0);
      acc[key].occurrences += 1;
      if (new Date(row.wasted_at).getTime() > new Date(acc[key].lastWastedAt).getTime()) acc[key].lastWastedAt = row.wasted_at;
      return acc;
    }, {});
    return Object.values(grouped).sort((a, b) => b.totalLoss - a.totalLoss);
  }, [wasteRows]);

  const visibleWasteRows = useMemo(() => wasteRows.filter((row) => {
    if (reasonFilter !== 'all' && String(row.reason || '').toLowerCase() !== reasonFilter) return false;
    if (!searchTerm) return true;
    const text = `${row.group_name || ''} ${row.product_name || ''} ${row.location_name || ''} ${row.created_by_name || ''}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  }), [reasonFilter, searchTerm, wasteRows]);
  const selectedWasteCard = useMemo(() => {
    if (period === 'weekly') {
      return {
        label: 'Weekly waste loss',
        value: summary.weekly_loss,
        tone: 'bg-warning',
        description: 'All waste recorded in the current week.',
      };
    }
    if (period === 'monthly') {
      return {
        label: 'Monthly waste loss',
        value: summary.monthly_loss,
        tone: 'bg-primary',
        description: 'All waste recorded in the current month.',
      };
    }
    return {
      label: 'Daily waste loss',
      value: summary.daily_loss,
      tone: 'bg-danger',
      description: 'Waste moved today from expired inventory.',
    };
  }, [period, summary.daily_loss, summary.weekly_loss, summary.monthly_loss]);

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="waste-page">
      <div className="page-header waste-header">
        <div>
          <h2>Waste Products</h2>
          <p className="text-muted mb-0">Expired inventory is automatically moved here and included in loss reporting.</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-secondary" onClick={loadWasteData}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={handleProcessExpired} disabled={processing}>
            <Trash2 size={16} /> {processing ? 'Processing...' : 'Run Expiry Check'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      <div className="card mb-3">
        <div className="card-body d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <h4 className="mb-1">Waste loss snapshot</h4>
            <p className="text-muted mb-0">Switch the range to review the same waste card by day, week, or month.</p>
          </div>
          <div className="btn-group">
            <button className={`btn btn-sm ${period === 'daily' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setPeriod('daily')}>Daily</button>
            <button className={`btn btn-sm ${period === 'weekly' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setPeriod('weekly')}>Weekly</button>
            <button className={`btn btn-sm ${period === 'monthly' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setPeriod('monthly')}>Monthly</button>
          </div>
        </div>
      </div>

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light">
          <div className={`stat-icon ${selectedWasteCard.tone} text-white`}><AlertTriangle size={22} /></div>
          <div className="stat-content">
            <h3>{formatMoney(selectedWasteCard.value)}</h3>
            <p>{selectedWasteCard.label}</p>
            <small className="text-muted">{selectedWasteCard.description}</small>
          </div>
        </div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-danger text-white"><AlertTriangle size={22} /></div><div className="stat-content"><h3>{formatMoney(summary.total_loss)}</h3><p>Total waste loss</p><small className="text-muted">Cumulative waste captured in the ledger.</small></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-secondary text-white"><Trash2 size={22} /></div><div className="stat-content"><h3>{Number(summary.monthly_items || 0)}</h3><p>Waste entries this month</p></div></div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><h3>Loss by product (aggregated)</h3></div>
        <div className="card-body">
          {!groupedRows.length ? (
            <div className="empty-state">
              <Trash2 size={40} className="text-muted" />
              <h4>No waste recorded</h4>
              <p>Expired products that are moved to waste will appear here.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Quantity Wasted</th>
                    <th>Total Loss</th>
                    <th>Occurrences</th>
                    <th>Latest Waste Time</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{row.quantity} {row.unit || 'unit'}</td>
                      <td>{formatMoney(row.totalLoss)}</td>
                      <td>{row.occurrences}</td>
                      <td>{new Date(row.lastWastedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <h3 className="mb-0">Waste event ledger (detailed)</h3>
          <div className="d-flex gap-2">
            <select className="form-select" style={{ minWidth: 160 }} value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
              <option value="all">All reasons</option>
              <option value="expired">Expired</option>
              <option value="damaged">Damaged</option>
              <option value="other">Other</option>
            </select>
            <input className="form-control" style={{ minWidth: 220 }} placeholder="Search product, location, user..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="card-body">
          {!visibleWasteRows.length ? (
            <div className="empty-state">
              <Trash2 size={40} className="text-muted" />
              <h4>No waste activity yet</h4>
              <p>When inventory expires, detailed waste movements will be logged here.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Location</th>
                    <th>Processed By</th>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Expiry Date</th>
                    <th>Cost / Unit</th>
                    <th>Total Loss</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleWasteRows.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.wasted_at).toLocaleString()}</td>
                      <td>{row.location_name || '—'}</td>
                      <td>{row.created_by_name || 'System'}</td>
                      <td>{row.group_name} / {row.product_name}</td>
                      <td>{Number(row.quantity_wasted || 0)} {row.unit || 'unit'}</td>
                      <td>{row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'No expiry'}</td>
                      <td>{formatMoney(row.cost_per_unit)}</td>
                      <td>{formatMoney(row.total_loss)}</td>
                      <td><span className="badge badge-danger text-uppercase">{row.reason}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
