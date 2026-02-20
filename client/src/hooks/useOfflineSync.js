import { useEffect, useCallback, useState } from 'react';
import api from '../api/axios';
import { flushQueue, getQueueSize, getSyncStats, isOnline, getConnectionQuality } from '../utils/offlineQueue';

const SYNC_INTERVAL_MS = 10000;

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
      setLastSyncResult({
        ...result,
        at: new Date().toISOString(),
        online: true,
      });
      
      localStorage.setItem('offline_sync_last_result', JSON.stringify(result));
    } catch (err) {
      console.error('Offline sync failed:', err);
      setLastSyncResult({
        synced: 0,
        failed: 0,
        error: err.message,
        at: new Date().toISOString(),
        online: navigator.onLine,
      });
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
      console.error('Failed to get queue stats:', err);
    }
  }, []);

  useEffect(() => {
    updateQueueStats();

    const interval = setInterval(() => {
      if (navigator.onLine) {
        runSync();
      }
      updateQueueStats();
    }, SYNC_INTERVAL_MS);

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
  }, [runSync, updateOnlineStatus, updateQueueStats]);

  return {
    isOnline: isOnlineState,
    queueStats,
    syncInProgress,
    lastSyncResult,
    runSync,
    connectionQuality: getConnectionQuality(),
  };
}

export default useOfflineSync;
