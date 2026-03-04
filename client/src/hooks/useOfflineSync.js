import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { flushQueue, getSyncStats, isOnline, getConnectionQuality } from '../utils/offlineQueue';

const BASE_SYNC_INTERVAL_MS = 12000;
const MIN_RETRY_GAP_MS = 15000;

function resolveSyncInterval(queueStats) {
  const quality = getConnectionQuality();
  if (quality === 'slow-2g' || quality === '2g') return 25000;
  if (queueStats.pending > 0 || queueStats.failed > 0) return 5000;
  return BASE_SYNC_INTERVAL_MS;
}

export function useOfflineSync() {
  const { user, isAuthenticated } = useAuth();
  const [isOnlineState, setIsOnlineState] = useState(() => isOnline());
  const [queueStats, setQueueStats] = useState({ total: 0, pending: 0, conflict: 0, needsReview: 0, failed: 0 });
  const [syncProgress, setSyncProgress] = useState({ total: 0, done: 0, active: false, finished: false });
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncOutcome, setSyncOutcome] = useState('idle');
  const [lastSyncResult, setLastSyncResult] = useState(() => {
    try {
      const cached = localStorage.getItem('offline_sync_last_result');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [appInitialized, setAppInitialized] = useState(false);
  const initializedRef = useRef(false);
  const finishResetTimeoutRef = useRef(null);
  const lastSyncAttemptRef = useRef(0);

  const runSync = useCallback(async (force = false) => {
    if (!isAuthenticated) return;
    if (syncInProgress && !force) return;

    const now = Date.now();
    if (!force && now - lastSyncAttemptRef.current < MIN_RETRY_GAP_MS) return;
    lastSyncAttemptRef.current = now;

    if (!navigator.onLine) {
      const stats = await getSyncStats();
      setQueueStats(stats);
      return;
    }

    setSyncInProgress(true);
    setSyncOutcome('in_progress');
    let pendingBefore = 0;
    let result = null;
    try {
      const beforeStats = await getSyncStats();
      pendingBefore = Number(beforeStats.pending || 0);
      if (pendingBefore > 0) {
        setSyncProgress({ total: pendingBefore, done: 0, active: true, finished: false });
      }
      result = await flushQueue(api);
      if (Array.isArray(result.completed) && result.completed.length > 0) {
        try {
          await api.post('/sync/audit/bulk', { events: result.completed });
        } catch (auditErr) {
          console.error('Failed to push sync audit events:', auditErr);
        }
      }
      const stats = await getSyncStats();
      setQueueStats(stats);
      const syncedCount = Number(result?.synced || 0);
      const failedCount = Number(result?.failed || 0);
      const finishedDone = Math.min(pendingBefore, syncedCount + failedCount);
      const hasPendingAfter = Number(stats.pending || 0) > 0;
      const hasAttentionAfter = Number(stats.failed || 0) > 0 || Number(stats.conflict || 0) > 0 || Number(stats.needsReview || 0) > 0;
      if (hasAttentionAfter) {
        setSyncOutcome('attention');
      } else if (syncedCount > 0 && !hasPendingAfter) {
        setSyncOutcome('success');
      } else if (hasPendingAfter) {
        setSyncOutcome('retrying');
      } else {
        setSyncOutcome('idle');
      }
      if (pendingBefore > 0) {
        setSyncProgress({ total: pendingBefore, done: finishedDone, active: false, finished: true });
        if (finishResetTimeoutRef.current) clearTimeout(finishResetTimeoutRef.current);
        finishResetTimeoutRef.current = setTimeout(() => {
          setSyncProgress((prev) => ({ ...prev, finished: false }));
          setSyncOutcome('idle');
        }, 6000);
      }
      const syncResult = {
        ...result,
        at: new Date().toISOString(),
        online: true,
      };
      setLastSyncResult(syncResult);
      try {
        localStorage.setItem('offline_sync_last_result', JSON.stringify(syncResult));
      } catch {
        console.error('Failed to cache offline sync result');
      }
    } catch (err) {
      const finishedDone = Math.min(pendingBefore, Number(result?.synced || 0) + Number(result?.failed || 0));
      setSyncOutcome('retrying');
      if (pendingBefore > 0) {
        setSyncProgress({ total: pendingBefore, done: finishedDone, active: false, finished: true });
        if (finishResetTimeoutRef.current) clearTimeout(finishResetTimeoutRef.current);
        finishResetTimeoutRef.current = setTimeout(() => {
          setSyncProgress((prev) => ({ ...prev, finished: false }));
          setSyncOutcome('idle');
        }, 6000);
      }
      const syncResult = {
        synced: 0,
        failed: 0,
        error: err.message,
        at: new Date().toISOString(),
        online: navigator.onLine,
      };
      setLastSyncResult(syncResult);
      try {
        localStorage.setItem('offline_sync_last_result', JSON.stringify(syncResult));
      } catch {
        console.error('Failed to cache offline sync result');
      }
    } finally {
      setSyncInProgress(false);
    }
  }, [syncInProgress, isAuthenticated]);

  const updateOnlineStatus = useCallback(async (eventType) => {
    const online = navigator.onLine;
    setIsOnlineState(online);

    if (online && eventType === 'online' && isAuthenticated) {
      await runSync(true);
    }
  }, [runSync, isAuthenticated]);

  const updateQueueStats = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const stats = await getSyncStats();
      setQueueStats(stats);
    } catch (err) {
      console.error('Failed to update queue stats:', err);
    }
  }, [isAuthenticated]);

  const syncInterval = useMemo(() => resolveSyncInterval(queueStats), [queueStats]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      await updateQueueStats();
      
      if (isAuthenticated && navigator.onLine) {
        await runSync(true);
      }
      
      setAppInitialized(true);
    };
    
    init();
  }, []);

  useEffect(() => {
    if (!appInitialized) return;

    const interval = setInterval(() => {
      if (navigator.onLine && isAuthenticated) {
        runSync();
      }
      updateQueueStats();
    }, syncInterval);

    const handleOnline = () => updateOnlineStatus('online');
    const handleOffline = () => updateOnlineStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateQueueStats();
        if (navigator.onLine && isAuthenticated) {
          runSync();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const handleConnectionChange = () => {
      updateQueueStats();
      if (navigator.onLine && isAuthenticated) {
        runSync();
      }
    };
    connection?.addEventListener?.('change', handleConnectionChange);

    return () => {
      clearInterval(interval);
      if (finishResetTimeoutRef.current) {
        clearTimeout(finishResetTimeoutRef.current);
        finishResetTimeoutRef.current = null;
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      connection?.removeEventListener?.('change', handleConnectionChange);
    };
  }, [appInitialized, runSync, syncInterval, updateOnlineStatus, updateQueueStats, isAuthenticated]);

  return {
    isOnline: isOnlineState,
    queueStats,
    syncInProgress,
    lastSyncResult,
    runSync: () => runSync(true),
    connectionQuality: getConnectionQuality(),
    syncInterval,
    appInitialized,
    syncProgress,
    syncOutcome,
  };
}

export default useOfflineSync;
