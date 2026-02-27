import dotenv from 'dotenv';
import { processOrderDueNotifications } from './routes/orders.js';
import { startArchiveScheduler } from './services/archiveService.js';
import { JOB_LOCK_KEYS, withAdvisoryJobLock } from './services/jobLockService.js';

dotenv.config();

const oneDayMs = 1000 * 60 * 60 * 24;

setInterval(() => {
  withAdvisoryJobLock(JOB_LOCK_KEYS.ORDER_DUE_NOTIFICATIONS, () => processOrderDueNotifications())
    .then((lockResult) => {
      if (lockResult.skipped) {
        console.log('[WORKER] Skipping order notification run: lock not acquired');
      }
    })
    .catch((err) => console.error('[WORKER] Order notification run failed:', err.message));
}, oneDayMs);

startArchiveScheduler();

console.log('[INFO] Worker started: order notification + archive scheduler loops are active');
