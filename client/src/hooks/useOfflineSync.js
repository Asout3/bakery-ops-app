import { useEffect } from 'react';
import api from '../api/axios';
import { flushQueue } from '../utils/offlineQueue';

export function useOfflineSync() {
  useEffect(() => {
    const runSync = async () => {
      try {
        await flushQueue(api);
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
