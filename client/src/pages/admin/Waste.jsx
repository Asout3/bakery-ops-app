import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, RefreshCw, Trash2 } from 'lucide-react';
import api, { getErrorMessage } from '../../api/axios';
import './Waste.css';

const formatMoney = (value) => `ETB ${Number(value || 0).toFixed(2)}`;

function getPeriodBounds(period) {
  const now = new Date();
  const start = new Date(now);

  if (period === 'weekly') {
    start.setDate(now.getDate() - 6);
  } else if (period === 'monthly') {
    start.setDate(now.getDate() - 29);
  }

  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function formatTimeRemaining(seconds) {
  const safeSeconds = Number(seconds || 0);
  if (safeSeconds <= 0) return 'Expired';

  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(minutes, 1)}m left`;
}

export default function WastePage() {
  const [wasteRows, setWasteRows] = useState([]);
  const [summary, setSummary] = useState({ daily_loss: 0, weekly_loss: 0, monthly_loss: 0, total_loss: 0, monthly_items: 0 });
  const [period, setPeriod] = useState('daily');
  const [expiringRows, setExpiringRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const loadWasteData = async (selectedPeriod = period) => {
    setError('');
    const bounds = getPeriodBounds(selectedPeriod);

    try {
      const [rowsRes, summaryRes, expiringRes] = await Promise.all([
        api.get('/waste', { params: { limit: 250, start_date: bounds.start, end_date: bounds.end } }),
        api.get('/waste/summary'),
        api.get('/waste/expiring', { params: { period: selectedPeriod, limit: 100 } }),
      ]);
      setWasteRows(rowsRes.data || []);
      setSummary(summaryRes.data || {});
      setExpiringRows(expiringRes.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load waste data.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWasteData(period);
  }, [period]);

  const handleProcessExpired = async () => {
    setProcessing(true);
    try {
      await api.post('/waste/process-expired');
      await loadWasteData(period);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to process expired inventory.'));
    } finally {
      setProcessing(false);
    }
  };

  const visibleWasteRows = useMemo(() => wasteRows.filter((row) => {
    if (!searchTerm) return true;
    const text = `${row.group_name || ''} ${row.product_name || ''} ${row.location_name || ''} ${row.created_by_name || ''}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  }), [searchTerm, wasteRows]);

  const selectedLoss = period === 'weekly'
    ? summary.weekly_loss
    : period === 'monthly'
      ? summary.monthly_loss
      : summary.daily_loss;

  const periodLabel = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly';
  const expiringStats = useMemo(() => ({
    batches: expiringRows.length,
    itemsLeft: expiringRows.reduce((sum, row) => sum + Number(row.quantity_remaining || 0), 0),
  }), [expiringRows]);

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="waste-page">
      <div className="page-header waste-header">
        <div>
          <h2>Waste Control Center</h2>
          <p className="text-muted mb-0">Track waste movement and identify stock batches that must sell first before expiry.</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-secondary" onClick={() => loadWasteData(period)}>
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
            <h4 className="mb-1">Waste period</h4>
            <p className="text-muted mb-0">Switch between daily, weekly, and monthly views to audit losses quickly.</p>
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
          <div className="stat-icon bg-danger text-white"><AlertTriangle size={22} /></div>
          <div className="stat-content">
            <h3>{formatMoney(selectedLoss)}</h3>
            <p>{periodLabel} waste loss</p>
            <small className="text-muted">Current selected period loss.</small>
          </div>
        </div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-warning text-white"><AlertTriangle size={22} /></div><div className="stat-content"><h3>{formatMoney(summary.total_loss)}</h3><p>Total waste loss</p><small className="text-muted">Cumulative waste captured in the ledger.</small></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-secondary text-white"><Trash2 size={22} /></div><div className="stat-content"><h3>{Number(summary.monthly_items || 0)}</h3><p>Waste entries this month</p></div></div>
      </div>

      <div className="card mb-4">
        <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <h3 className="mb-0">Wasted products ({periodLabel.toLowerCase()})</h3>
          <input className="form-control" style={{ minWidth: 240, maxWidth: 360 }} placeholder="Search product, location, user..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="card-body">
          {!visibleWasteRows.length ? (
            <div className="empty-state">
              <Trash2 size={40} className="text-muted" />
              <h4>No waste records for this period</h4>
              <p>Any waste movement in the selected period will be listed from newest to oldest.</p>
            </div>
          ) : (
            <div className="waste-list">
              {visibleWasteRows.map((row) => (
                <div className="waste-list-item" key={row.id}>
                  <div>
                    <div className="waste-item-title">{row.group_name} / {row.product_name}</div>
                    <div className="waste-item-meta">{new Date(row.wasted_at).toLocaleString()} • {row.created_by_name || 'System'}</div>
                  </div>
                  <div className="waste-item-values">
                    <div><strong>{Number(row.quantity_wasted || 0)}</strong> {row.unit || 'unit'}</div>
                    <div>{formatMoney(row.total_loss)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <h3 className="mb-0">Sell first: nearest to expiry</h3>
          <span className="text-muted small d-inline-flex align-items-center gap-1">
            <Clock3 size={14} />
            {expiringStats.batches} batches about to expire • {expiringStats.itemsLeft} items left
          </span>
        </div>
        <div className="card-body">
          {!expiringRows.length ? (
            <div className="empty-state">
              <Clock3 size={40} className="text-muted" />
              <h4>No expiring stock in this range</h4>
              <p>When stock is approaching expiry, the oldest batches will appear here first.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Sold</th>
                    <th>Left</th>
                    <th>Expiry</th>
                    <th>Time Left</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringRows.map((row) => (
                    <tr key={row.stock_batch_id}>
                      <td>{row.group_name} / {row.product_name}</td>
                      <td>#{row.stock_batch_id}</td>
                      <td>{Number(row.quantity_sold || 0)} {row.unit || 'unit'}</td>
                      <td>{Number(row.quantity_remaining || 0)} {row.unit || 'unit'}</td>
                      <td>{new Date(row.expires_at).toLocaleString()}</td>
                      <td><span className={`expiry-pill ${Number(row.seconds_until_expiry || 0) < 86400 ? 'urgent' : ''}`}>{formatTimeRemaining(row.seconds_until_expiry)}</span></td>
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
