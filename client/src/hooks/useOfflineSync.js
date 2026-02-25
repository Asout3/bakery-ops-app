import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { flushQueue, getSyncStats, isOnline, getConnectionQuality } from '../utils/offlineQueue';

const BASE_SYNC_INTERVAL_MS = 10000;

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
  const [lastSyncResult, setLastSyncResult] = useState(() => {
    const cached = localStorage.getItem('offline_sync_last_result');
    return cached ? JSON.parse(cached) : null;
  });
  const [appInitialized, setAppInitialized] = useState(false);
  const initializedRef = useRef(false);

  const runSync = useCallback(async (force = false) => {
    if (!isAuthenticated) return;
    if (syncInProgress && !force) return;

    if (!navigator.onLine) {
      const stats = await getSyncStats();
      setQueueStats(stats);
      return;
    }

    setSyncInProgress(true);
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
      const finishedDone = Math.min(pendingBefore, Number(result.synced || 0) + Number(result.failed || 0));
      if (pendingBefore > 0) {
        setSyncProgress({ total: pendingBefore, done: finishedDone, active: false, finished: true });
        setTimeout(() => setSyncProgress((prev) => ({ ...prev, finished: false })), 3500);
      }
      const syncResult = {
        ...result,
        at: new Date().toISOString(),
        online: true,
      };
      setLastSyncResult(syncResult);
      localStorage.setItem('offline_sync_last_result', JSON.stringify(syncResult));
    } catch (err) {
      const finishedDone = Math.min(pendingBefore, Number(result.synced || 0) + Number(result.failed || 0));
      if (pendingBefore > 0) {
        setSyncProgress({ total: pendingBefore, done: finishedDone, active: false, finished: true });
        setTimeout(() => setSyncProgress((prev) => ({ ...prev, finished: false })), 3500);
      }
      const syncResult = {
        synced: 0,
        failed: 0,
        error: err.message,
        at: new Date().toISOString(),
        online: navigator.onLine,
      };
      setLastSyncResult(syncResult);
      localStorage.setItem('offline_sync_last_result', JSON.stringify(syncResult));
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
          runSync(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const handleConnectionChange = () => {
      updateQueueStats();
      if (navigator.onLine && isAuthenticated) {
        runSync(true);
      }
    };
    connection?.addEventListener?.('change', handleConnectionChange);

    return () => {
      clearInterval(interval);
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
  };
}

export default useOfflineSync;
