import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { getSyncStats, retryOperation, cancelOperation, listQueuedOperations } from '../utils/offlineQueue';
import './OfflineIndicator.css';

export default function OfflineIndicator() {
  const { isOnline, queueStats, syncInProgress, lastSyncResult, runSync } = useOfflineSync();
  const [expanded, setExpanded] = useState(false);
  const [conflictOps, setConflictOps] = useState([]);

  useEffect(() => {
    if (queueStats.conflict > 0 || queueStats.failed > 0) {
      loadConflicts();
    }
  }, [queueStats.conflict, queueStats.failed]);

  const loadConflicts = async () => {
    const ops = await listQueuedOperations();
    setConflictOps(ops.filter(op => op.status === 'conflict' || op.status === 'failed'));
  };

  const handleRetry = async (operationId) => {
    await retryOperation(operationId);
    await loadConflicts();
    runSync();
  };

  const handleCancel = async (operationId) => {
    await cancelOperation(operationId);
    await loadConflicts();
  };

  if (isOnline && queueStats.total === 0 && queueStats.conflict === 0 && queueStats.failed === 0) {
    return null;
  }

  return (
    <div className={`offline-indicator ${!isOnline ? 'offline' : ''} ${queueStats.conflict > 0 || queueStats.failed > 0 ? 'has-conflicts' : ''}`}>
      <div className="indicator-bar" onClick={() => setExpanded(!expanded)}>
        {!isOnline ? (
          <>
            <WifiOff size={16} />
            <span>Offline Mode</span>
            {queueStats.pending > 0 && <span className="badge">{queueStats.pending} pending</span>}
          </>
        ) : syncInProgress ? (
          <>
            <RefreshCw size={16} className="spinning" />
            <span>Syncing...</span>
          </>
        ) : queueStats.conflict > 0 || queueStats.failed > 0 ? (
          <>
            <AlertTriangle size={16} />
            <span>{queueStats.conflict + queueStats.failed} issue{(queueStats.conflict + queueStats.failed) > 1 ? 's' : ''}</span>
          </>
        ) : queueStats.pending > 0 ? (
          <>
            <RefreshCw size={16} />
            <span>{queueStats.pending} pending sync</span>
          </>
        ) : (
          <>
            <CheckCircle size={16} />
            <span>Synced</span>
          </>
        )}
      </div>

      {expanded && (
        <div className="indicator-expanded">
          <div className="sync-status">
            <div className="status-row">
              <span>Status:</span>
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <div className="status-row">
              <span>Pending:</span>
              <span>{queueStats.pending}</span>
            </div>
            <div className="status-row">
              <span>Conflicts:</span>
              <span className={queueStats.conflict > 0 ? 'text-warning' : ''}>{queueStats.conflict}</span>
            </div>
            <div className="status-row">
              <span>Failed:</span>
              <span className={queueStats.failed > 0 ? 'text-danger' : ''}>{queueStats.failed}</span>
            </div>
          </div>

          {(queueStats.conflict > 0 || queueStats.failed > 0) && (
            <div className="conflicts-list">
              <h4>Issues ({conflictOps.length})</h4>
              {conflictOps.slice(0, 5).map((op) => (
                <div key={op.id} className="conflict-item">
                  <div className="conflict-info">
                    <span className="conflict-type">{op.method?.toUpperCase()} {op.url}</span>
                    <span className="conflict-error">{op.lastError || 'Unknown error'}</span>
                    <span className="conflict-time">{new Date(op.lastAttempt || op.created_at).toLocaleString()}</span>
                  </div>
                  <div className="conflict-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => handleRetry(op.id)}>
                      Retry
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleCancel(op.id)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
              {conflictOps.length > 5 && (
                <p className="more-items">+{conflictOps.length - 5} more</p>
              )}
            </div>
          )}

          {isOnline && queueStats.pending > 0 && (
            <button className="btn btn-primary btn-sm" onClick={runSync} disabled={syncInProgress}>
              {syncInProgress ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
