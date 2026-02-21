import { useEffect, useCallback, useMemo, useState } from 'react';
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
  const [isOnlineState, setIsOnlineState] = useState(isOnline());
  const [queueStats, setQueueStats] = useState({ total: 0, pending: 0, conflict: 0, failed: 0 });
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);

  const runSync = useCallback(async () => {
    if (syncInProgress || !navigator.onLine) return;

    setSyncInProgress(true);
    try {
      const result = await flushQueue(api);
      const stats = await getSyncStats();
      setQueueStats(stats);
      const syncResult = {
        ...result,
        at: new Date().toISOString(),
        online: true,
      };
      setLastSyncResult(syncResult);
      localStorage.setItem('offline_sync_last_result', JSON.stringify(syncResult));
    } catch (err) {
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
  }, [syncInProgress]);

  const updateOnlineStatus = useCallback(async () => {
    const online = navigator.onLine;
    setIsOnlineState(online);

    if (online) {
      await runSync();
    }
  }, [runSync]);

  const updateQueueStats = useCallback(async () => {
    try {
      const stats = await getSyncStats();
      setQueueStats(stats);
    } catch (err) {
      setLastSyncResult((prev) => ({
        ...(prev || {}),
        error: err.message,
        at: new Date().toISOString(),
      }));
    }
  }, []);

  const syncInterval = useMemo(() => resolveSyncInterval(queueStats), [queueStats]);

  useEffect(() => {
    updateQueueStats();

    const interval = setInterval(() => {
      if (navigator.onLine) {
        runSync();
      }
      updateQueueStats();
    }, syncInterval);

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        updateQueueStats();
        if (navigator.onLine) {
          runSync();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [runSync, syncInterval, updateOnlineStatus, updateQueueStats]);

  return {
    isOnline: isOnlineState,
    queueStats,
    syncInProgress,
    lastSyncResult,
    runSync,
    connectionQuality: getConnectionQuality(),
    syncInterval,
  };
}

export default useOfflineSync;
