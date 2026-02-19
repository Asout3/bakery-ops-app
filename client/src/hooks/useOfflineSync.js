import { useEffect } from 'react';
import api from '../api/axios';
import { flushQueue, getQueueSize } from '../utils/offlineQueue';

export function useOfflineSync() {
  useEffect(() => {
    const runSync = async () => {
      try {
        const result = await flushQueue(api);
        const queueSize = await getQueueSize();
        localStorage.setItem('offline_sync_last_result', JSON.stringify({ ...result, queueSize, at: new Date().toISOString() }));
      } catch (err) {
        console.error('Offline sync failed:', err);
      }
    };

    runSync();
    const interval = setInterval(runSync, 7000);
    window.addEventListener('online', runSync);
    const onVisible = () => {
      if (document.visibilityState === 'visible') runSync();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', runSync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
