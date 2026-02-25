import { useState, useEffect, useCallback } from 'react';
import { WifiOff, RefreshCw, AlertTriangle, CheckCircle, Minimize2, Maximize2 } from 'lucide-react';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { retryOperation, cancelOperation, listQueuedOperations } from '../utils/offlineQueue';
import { useAuth } from '../context/AuthContext';
import './OfflineIndicator.css';

export default function OfflineIndicator() {
  const { user, isAuthenticated } = useAuth();
  const { isOnline, queueStats, syncInProgress, runSync, appInitialized, syncProgress } = useOfflineSync();
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [conflictOps, setConflictOps] = useState([]);

  const isAdmin = user?.role === 'admin';

  const loadConflicts = useCallback(async () => {
    if (!isAdmin || !isAuthenticated) {
      setConflictOps([]);
      return;
    }
    const ops = await listQueuedOperations();
    setConflictOps(ops.filter((op) => op.status === 'conflict' || op.status === 'failed' || op.status === 'needs_review'));
  }, [isAdmin, isAuthenticated]);

  useEffect(() => {
    if (!appInitialized || !isAuthenticated) return;
    if (queueStats.pending > 0 && !collapsed) {
      setExpanded(true);
    }
  }, [queueStats.pending, appInitialized, isAuthenticated, collapsed]);

  useEffect(() => {
    if (!appInitialized || !isAuthenticated) return;
    if (isAdmin && (queueStats.conflict > 0 || queueStats.failed > 0 || queueStats.needsReview > 0)) {
      loadConflicts();
    }
  }, [isAdmin, queueStats.conflict, queueStats.failed, queueStats.needsReview, loadConflicts, appInitialized, isAuthenticated]);

  if (!appInitialized || !isAuthenticated) {
    return null;
  }

  const handleRetry = async (operationId) => {
    await retryOperation(operationId);
    await loadConflicts();
    runSync();
  };

  const handleCancel = async (operationId) => {
    await cancelOperation(operationId);
    await loadConflicts();
  };

  const issueCount = isAdmin ? (queueStats.conflict + queueStats.failed + (queueStats.needsReview || 0)) : 0;
  const shouldShowDone = Boolean(syncProgress.finished && syncProgress.total > 0);
  const doneText = shouldShowDone ? `Done ${syncProgress.done}/${syncProgress.total}` : '';

  if (isOnline && queueStats.total === 0 && issueCount === 0 && !shouldShowDone) {
    return null;
  }

  if (collapsed) {
    return (
      <button className="offline-chip" type="button" onClick={() => { setCollapsed(false); setExpanded(true); }}>
        <Maximize2 size={14} />
        {queueStats.pending > 0 ? `${queueStats.pending} pending` : (shouldShowDone ? doneText : 'Sync')}
      </button>
    );
  }

  return (
    <div className={`offline-indicator ${!isOnline ? 'offline' : ''} ${issueCount > 0 ? 'has-conflicts' : ''}`}>
      <div className="indicator-bar" onClick={() => setExpanded((prev) => !prev)}>
        {!isOnline ? (
          <>
            <WifiOff size={16} />
            <span>Offline Mode</span>
            {queueStats.pending > 0 && <span className="badge">{queueStats.pending} pending</span>}
          </>
        ) : syncInProgress ? (
          <>
            <RefreshCw size={16} className="spinning" />
            <span>Syncing {syncProgress.done}/{syncProgress.total || queueStats.pending}</span>
          </>
        ) : shouldShowDone ? (
          <>
            <CheckCircle size={16} />
            <span>{doneText}</span>
          </>
        ) : issueCount > 0 ? (
          <>
            <AlertTriangle size={16} />
            <span>{issueCount} issue{issueCount > 1 ? 's' : ''}</span>
          </>
        ) : (
          <>
            <CheckCircle size={16} />
            <span>Synced</span>
          </>
        )}
        <button type="button" className="minimize-btn" onClick={(e) => { e.stopPropagation(); setCollapsed(true); setExpanded(false); }}>
          <Minimize2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="indicator-expanded">
          <div className="sync-status">
            <div className="status-row"><span>Status:</span><span>{isOnline ? 'Online' : 'Offline'}</span></div>
            <div className="status-row"><span>Pending:</span><span>{queueStats.pending}</span></div>
            {syncProgress.total > 0 && <div className="status-row"><span>Progress:</span><span>{syncProgress.done}/{syncProgress.total}</span></div>}
            {isAdmin && <div className="status-row"><span>Needs Review:</span><span className={queueStats.needsReview > 0 ? 'text-warning' : ''}>{queueStats.needsReview || 0}</span></div>}
            {isAdmin && <div className="status-row"><span>Conflicts:</span><span className={queueStats.conflict > 0 ? 'text-warning' : ''}>{queueStats.conflict}</span></div>}
            {isAdmin && <div className="status-row"><span>Failed:</span><span className={queueStats.failed > 0 ? 'text-danger' : ''}>{queueStats.failed}</span></div>}
          </div>

          {isAdmin && issueCount > 0 && (
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
                    <button className="btn btn-sm btn-primary" onClick={() => handleRetry(op.id)}>Retry</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleCancel(op.id)}>Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isOnline && queueStats.pending > 0 && (
            <button className="btn btn-primary btn-sm" onClick={runSync} disabled={syncInProgress}>
              {syncInProgress ? 'Running...' : 'Sync Now'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
