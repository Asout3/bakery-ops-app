import { query } from '../db.js';

export const JOB_LOCK_KEYS = {
  ORDER_DUE_NOTIFICATIONS: 90421011,
  ARCHIVE_SCHEDULER: 90421012,
};

export async function withAdvisoryJobLock(lockKey, task, dbQuery = query) {
  const lockResult = await dbQuery('SELECT pg_try_advisory_lock($1) AS acquired', [lockKey]);
  const acquired = Boolean(lockResult.rows[0]?.acquired);

  if (!acquired) {
    return { skipped: true, reason: 'lock_not_acquired' };
  }

  try {
    const result = await task();
    return { skipped: false, result };
  } finally {
    await dbQuery('SELECT pg_advisory_unlock($1)', [lockKey]);
  }
}
