import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { flushQueue, listQueuedOperations, listSyncHistory } from '../../utils/offlineQueue';

export default function SyncQueuePage() {
  const [queued, setQueued] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncResult, setSyncResult] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [q, h] = await Promise.all([listQueuedOperations(), listSyncHistory(200)]);
      setQueued(q);
      setHistory(h);
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

      <div className="card mb-4">
        <div className="card-header"><h3>Queued Operations ({queued.length})</h3></div>
        <div className="card-body">
          {queued.length === 0 ? <p className="text-muted">No queued operations.</p> : (
            <ul>
              {queued.map((op) => (
                <li key={op.id}>{op.method?.toUpperCase()} {op.url} — retries: {op.retries || 0}</li>
              ))}
            </ul>
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
                      <td><span className="badge badge-secondary">{item.status}</span></td>
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
