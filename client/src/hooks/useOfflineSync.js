import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/axios';
import { 
  flushQueue, 
  getSyncStats, 
  isOnline, 
  getConnectionQuality,
  checkBackendConnectivity,
  shouldCheckBackendConnectivity,
  getBackendReachable,
  setBackendReachable,
} from '../utils/offlineQueue';

const BASE_SYNC_INTERVAL_MS = 12000;
const MIN_RETRY_GAP_MS = 15000;
const BACKEND_HEALTH_CHECK_INTERVAL_MS = 45000; // Check backend health every 45 seconds

function resolveSyncInterval(queueStats) {
  const quality = getConnectionQuality();
  if (quality === 'slow-2g' || quality === '2g') return 25000;
  if (queueStats.pending > 0 || queueStats.failed > 0) return 5000;
  return BASE_SYNC_INTERVAL_MS;
}

export function useOfflineSync() {
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();
  const [isOnlineState, setIsOnlineState] = useState(() => isOnline());
  const [backendReachable, setBackendReachableState] = useState(() => getBackendReachable());
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
  const [lastHealthCheck, setLastHealthCheck] = useState(null);
  const initializedRef = useRef(false);
  const finishResetTimeoutRef = useRef(null);
  const lastSyncAttemptRef = useRef(0);
  const lastNotifiedPendingRef = useRef(0);
  const healthCheckIntervalRef = useRef(null);
  
  // Get API base URL for health checks
  const apiBaseUrl = api.defaults.baseURL || '/api';

  // Actively check if backend is reachable
  const checkBackend = useCallback(async () => {
    if (!navigator.onLine) {
      setBackendReachable(false);
      setBackendReachableState(false);
      setIsOnlineState(false);
      return false;
    }

    const reachable = await checkBackendConnectivity(apiBaseUrl);
    setBackendReachableState(reachable);
    setIsOnlineState(navigator.onLine && reachable);
    setLastHealthCheck(new Date().toISOString());
    
    if (!reachable && navigator.onLine) {
      console.warn('[OfflineSync] Browser online but backend unreachable');
    }
    
    return reachable;
  }, [apiBaseUrl]);

  const runSync = useCallback(async (force = false) => {
    if (!isAuthenticated) return;
    if (syncInProgress && !force) return;

    const now = Date.now();
    if (!force && now - lastSyncAttemptRef.current < MIN_RETRY_GAP_MS) return;
    lastSyncAttemptRef.current = now;

    // Check backend connectivity before attempting sync
    if (!navigator.onLine) {
      setIsOnlineState(false);
      const stats = await getSyncStats();
      setQueueStats(stats);
      if (stats.pending > lastNotifiedPendingRef.current) {
        toast.info('Action added to offline queue. It will sync when connection returns.');
      }
      lastNotifiedPendingRef.current = stats.pending;
      return;
    }

    // Actively verify backend is reachable before sync
    const backendOk = await checkBackend();
    if (!backendOk) {
      const stats = await getSyncStats();
      setQueueStats(stats);
      if (stats.pending > lastNotifiedPendingRef.current) {
        toast.info('Server unreachable. Actions queued for sync when connection is restored.');
      }
      lastNotifiedPendingRef.current = stats.pending;
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
        toast.info(`Sync started: ${pendingBefore} queued action${pendingBefore > 1 ? 's' : ''}.`);
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
      const syncedCount = Number(result?.visibleSynced ?? result?.synced ?? 0);
      const failedCount = Number(result?.visibleFailed ?? result?.failed ?? 0);
      const finishedDone = Math.min(pendingBefore, syncedCount + failedCount);
      const hasPendingAfter = Number(stats.pending || 0) > 0;
      const hasAttentionAfter = Number(stats.failed || 0) > 0 || Number(stats.conflict || 0) > 0 || Number(stats.needsReview || 0) > 0;
      if (hasAttentionAfter) {
        setSyncOutcome('attention');
        toast.warning('Sync finished with items needing admin review.');
      } else if (syncedCount > 0 && !hasPendingAfter) {
        setSyncOutcome('success');
        toast.success(`Sync complete: ${syncedCount} queued action${syncedCount > 1 ? 's' : ''} sent.`);
      } else if (hasPendingAfter) {
        setSyncOutcome('retrying');
        toast.info('Sync is retrying pending actions due to network/server issues.');
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
        synced: syncedCount,
        failed: failedCount,
        pending: Number(result?.visiblePending ?? stats.pending ?? 0),
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
      toast.warning('Sync interrupted. Pending actions are still safe in queue and will retry.');
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
  }, [syncInProgress, isAuthenticated, toast]);

  const updateOnlineStatus = useCallback(async (eventType) => {
    if (!navigator.onLine) {
      setBackendReachable(false);
      setBackendReachableState(false);
      setIsOnlineState(false);
      return;
    }

    // When browser goes online, actively verify backend
    if (eventType === 'online') {
      toast.info('Network detected. Checking server connection...');
      const reachable = await checkBackend();
      
      if (reachable && isAuthenticated) {
        toast.success('Server connection restored. Syncing...');
        await runSync(true);
      } else if (!reachable) {
        toast.warning('Network available but server is unreachable. Will retry automatically.');
      }
    }
  }, [runSync, isAuthenticated, checkBackend, toast]);

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
      setAppInitialized(true);
      
      // On init, actively check backend connectivity
      if (navigator.onLine) {
        const reachable = await checkBackend();
        if (reachable && isAuthenticated) {
          await runSync(true);
        }
      } else {
        setIsOnlineState(false);
        setBackendReachableState(false);
      }
    };
    
    init();
  }, []);

  useEffect(() => {
    if (!appInitialized) return;

    // Sync interval - also includes backend check before sync
    const interval = setInterval(async () => {
      if (navigator.onLine && isAuthenticated) {
        // Periodically verify backend is reachable
        if (shouldCheckBackendConnectivity()) {
          await checkBackend();
        }
        // Only sync if backend is confirmed reachable
        if (getBackendReachable()) {
          runSync();
        }
      }
      updateQueueStats();
    }, syncInterval);

    // Periodic backend health check (separate from sync)
    healthCheckIntervalRef.current = setInterval(async () => {
      if (navigator.onLine) {
        const wasReachable = getBackendReachable();
        const nowReachable = await checkBackend();
        
        // If backend just became reachable, trigger sync
        if (!wasReachable && nowReachable && isAuthenticated) {
          toast.success('Server connection restored.');
          runSync(true);
        }
      }
    }, BACKEND_HEALTH_CHECK_INTERVAL_MS);

    const handleOnline = () => updateOnlineStatus('online');
    const handleOffline = () => updateOnlineStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for our custom backend connectivity event
    const handleBackendChange = (event) => {
      const { reachable } = event.detail;
      setBackendReachableState(reachable);
      setIsOnlineState(navigator.onLine && reachable);
    };
    window.addEventListener('backend-connectivity-change', handleBackendChange);

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        updateQueueStats();
        // When tab becomes visible, check backend and sync if possible
        if (navigator.onLine && isAuthenticated) {
          const reachable = await checkBackend();
          if (reachable) {
            runSync();
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const handleConnectionChange = async () => {
      updateQueueStats();
      if (navigator.onLine && isAuthenticated) {
        const reachable = await checkBackend();
        if (reachable) {
          runSync();
        }
      }
    };
    connection?.addEventListener?.('change', handleConnectionChange);

    return () => {
      clearInterval(interval);
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
      if (finishResetTimeoutRef.current) {
        clearTimeout(finishResetTimeoutRef.current);
        finishResetTimeoutRef.current = null;
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('backend-connectivity-change', handleBackendChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      connection?.removeEventListener?.('change', handleConnectionChange);
    };
  }, [appInitialized, runSync, syncInterval, updateOnlineStatus, updateQueueStats, isAuthenticated, checkBackend, toast]);

  return {
    isOnline: isOnlineState,
    backendReachable,
    queueStats,
    syncInProgress,
    lastSyncResult,
    lastHealthCheck,
    runSync: () => runSync(true),
    checkBackend,
    connectionQuality: getConnectionQuality(),
    syncInterval,
    appInitialized,
    syncProgress,
    syncOutcome,
  };
}

export default useOfflineSync;
