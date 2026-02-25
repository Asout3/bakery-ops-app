import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { flushQueue, getSyncStats, listQueuedOperations, listSyncHistory, retryOperation, resolveOperation, ignoreOperation } from '../../utils/offlineQueue';

const getStatusLabel = (status) => {
  if (status === 'needs_review') return 'Needs Review';
  if (status === 'conflict') return 'Conflict';
  if (status === 'failed') return 'Failed';
  if (status === 'synced') return 'Synced';
  if (status === 'resolved') return 'Resolved';
  if (status === 'ignored') return 'Ignored';
  if (status === 'retrying') return 'Retrying';
  if (status === 'pending') return 'Pending';
  return status;
};

const getStatusBadgeClass = (status) => {
  if (status === 'needs_review') return 'badge-warning';
  if (status === 'conflict') return 'badge-danger';
  if (status === 'failed') return 'badge-danger';
  if (status === 'synced') return 'badge-success';
  if (status === 'resolved') return 'badge-success';
  if (status === 'ignored') return 'badge-secondary';
  if (status === 'retrying') return 'badge-info';
  if (status === 'pending') return 'badge-primary';
  return 'badge-secondary';
};

export default function SyncQueuePage() {
  const [queued, setQueued] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, conflict: 0, needsReview: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [syncResult, setSyncResult] = useState(null);
  const [adminNotes, setAdminNotes] = useState({});

  const refresh = async () => {
    setLoading(true);
    try {
      const [q, h, s] = await Promise.all([listQueuedOperations(), listSyncHistory(200), getSyncStats()]);
      setQueued(q);
      setHistory(h);
      setStats(s);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSyncNow = async () => {
    const result = await flushQueue(api);
    setSyncResult(result);
    await refresh();
  };

  const handleRetry = async (operationId) => {
    await retryOperation(operationId);
    await refresh();
  };

  const handleResolve = async (operationId) => {
    await resolveOperation(operationId, adminNotes[operationId] || '');
    setAdminNotes((prev) => ({ ...prev, [operationId]: '' }));
    await refresh();
  };

  const handleIgnore = async (operationId) => {
    await ignoreOperation(operationId, adminNotes[operationId] || '');
    setAdminNotes((prev) => ({ ...prev, [operationId]: '' }));
    await refresh();
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="reports-page">
      <div className="page-header">
        <h2>Offline Sync & Conflict Log</h2>
        <button className="btn btn-primary" onClick={handleSyncNow}>Sync Now</button>
      </div>

      {syncResult && (
        <div className="alert alert-info mb-3">
          Last sync: {syncResult.synced || 0} synced, {syncResult.failed || 0} failed.
        </div>
      )}

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light"><div className="stat-content"><h3>{stats.total}</h3><p>Total Queued</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-content"><h3>{stats.pending}</h3><p>Pending</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-content"><h3>{stats.needsReview || 0}</h3><p>Needs Review</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-content"><h3>{stats.conflict}</h3><p>Conflicts</p></div></div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><h3>Queued Operations ({queued.length})</h3></div>
        <div className="card-body">
          {queued.length === 0 ? <p className="text-muted">No queued operations.</p> : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead><tr><th>Operation</th><th>Status</th><th>Retries</th><th>Last Error</th><th>Actions</th></tr></thead>
                <tbody>
                  {queued.map((op) => (
                    <tr key={op.id}>
                      <td>{op.method?.toUpperCase()} {op.url}</td>
                      <td><span className={`badge ${getStatusBadgeClass(op.status)}`}>{getStatusLabel(op.status)}</span></td>
                      <td>{op.retries || 0}</td>
                      <td>{op.lastError || '—'}</td>
                      <td>
                        {(op.status === 'conflict' || op.status === 'failed' || op.status === 'needs_review') ? (
                          <div style={{ display: 'grid', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button className="btn btn-sm btn-primary" onClick={() => handleRetry(op.id)}>Retry</button>
                              <button className="btn btn-sm btn-success" onClick={() => handleResolve(op.id)}>Mark Resolved</button>
                              <button className="btn btn-sm btn-secondary" onClick={() => handleIgnore(op.id)}>Ignore</button>
                            </div>
                            <input
                              className="form-control form-control-sm"
                              type="text"
                              placeholder="Optional resolution note"
                              value={adminNotes[op.id] || ''}
                              onChange={(e) => setAdminNotes((prev) => ({ ...prev, [op.id]: e.target.value }))}
                            />
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Retry / Conflict History</h3></div>
        <div className="card-body">
          {history.length === 0 ? <p className="text-muted">No sync history yet.</p> : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead><tr><th>Time</th><th>Status</th><th>Operation</th><th>Message</th></tr></thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.created_at).toLocaleString()}</td>
                      <td><span className={`badge ${getStatusBadgeClass(item.status)}`}>{getStatusLabel(item.status)}</span></td>
                      <td>{item.operation_id}</td>
                      <td>{item.message}</td>
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
