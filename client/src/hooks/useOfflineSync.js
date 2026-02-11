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
    const interval = setInterval(runSync, 15000);
    window.addEventListener('online', runSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', runSync);
    };
  }, []);
}
