import { query, withTransaction } from '../db.js';
import { JOB_LOCK_KEYS, withAdvisoryJobLock } from './jobLockService.js';

const DEFAULT_CONFIRMATION_PHRASE = 'I CONFIRM TO ARCHIVE THE LAST 6 MONTH HISTORY';

async function getLocationsToProcess(locationId = null) {
  if (locationId) {
    const single = await query('SELECT id FROM locations WHERE id = $1 AND is_active = true', [locationId]);
    return single.rows;
  }
  const result = await query('SELECT id FROM locations WHERE is_active = true');
  return result.rows;
}

export async function ensureArchiveSettings(locationId, userId = null) {
  const ensured = await query(
    `INSERT INTO archive_settings (location_id, created_by, updated_by)
     VALUES ($1, $2, $2)
     ON CONFLICT (location_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [locationId, userId]
  );
  return ensured.rows[0];
}

async function createArchiveNotification(tx, locationId, title, message, type = 'archive') {
  await tx.query(
    `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
     SELECT id, $1, $2, $3, $4
     FROM users
     WHERE location_id = $1 AND role = 'admin' AND is_active = true`,
    [locationId, title, message, type]
  );
}

async function moveRowsToArchive(tx, config) {
  const counts = {};

  const batches = await tx.query(
    `WITH moved AS (
      INSERT INTO inventory_batches_archive
      SELECT * FROM inventory_batches
      WHERE location_id = $1 AND created_at < $2
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM moved`,
    [config.locationId, config.cutoffAt]
  );
  counts.inventory_batches = batches.rows[0].count;

  if (counts.inventory_batches > 0) {
    await tx.query(
      `INSERT INTO batch_items_archive
       SELECT bi.* FROM batch_items bi
       JOIN inventory_batches_archive iba ON iba.id = bi.batch_id
       LEFT JOIN batch_items_archive bia ON bia.id = bi.id
       WHERE iba.location_id = $1 AND bia.id IS NULL`,
      [config.locationId]
    );

    await tx.query(
      `DELETE FROM batch_items
       WHERE batch_id IN (
         SELECT id FROM inventory_batches_archive WHERE location_id = $1 AND created_at < $2
       )`,
      [config.locationId, config.cutoffAt]
    );

    await tx.query(
      'DELETE FROM inventory_batches WHERE location_id = $1 AND created_at < $2',
      [config.locationId, config.cutoffAt]
    );
  }

  const sales = await tx.query(
    `WITH moved_sales AS (
      INSERT INTO sales_archive
      SELECT * FROM sales
      WHERE location_id = $1 AND sale_date < $2
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM moved_sales`,
    [config.locationId, config.cutoffAt]
  );
  counts.sales = sales.rows[0].count;

  if (counts.sales > 0) {
    await tx.query(
      `INSERT INTO sale_items_archive
       SELECT si.* FROM sale_items si
       JOIN sales_archive sa ON sa.id = si.sale_id
       LEFT JOIN sale_items_archive sia ON sia.id = si.id
       WHERE sa.location_id = $1 AND sia.id IS NULL`,
      [config.locationId]
    );

    await tx.query(
      `DELETE FROM sale_items
       WHERE sale_id IN (
         SELECT id FROM sales_archive WHERE location_id = $1 AND sale_date < $2
       )`,
      [config.locationId, config.cutoffAt]
    );

    await tx.query('DELETE FROM sales WHERE location_id = $1 AND sale_date < $2', [config.locationId, config.cutoffAt]);
  }

  const movements = await tx.query(
    `WITH moved AS (
      INSERT INTO inventory_movements_archive
      SELECT * FROM inventory_movements
      WHERE location_id = $1 AND created_at < $2
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM moved`,
    [config.locationId, config.cutoffAt]
  );
  counts.inventory_movements = movements.rows[0].count;
  if (counts.inventory_movements > 0) {
    await tx.query('DELETE FROM inventory_movements WHERE location_id = $1 AND created_at < $2', [config.locationId, config.cutoffAt]);
  }

  const activities = await tx.query(
    `WITH moved AS (
      INSERT INTO activity_log_archive
      SELECT * FROM activity_log
      WHERE location_id = $1 AND created_at < $2
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM moved`,
    [config.locationId, config.cutoffAt]
  );
  counts.activity_log = activities.rows[0].count;
  if (counts.activity_log > 0) {
    await tx.query('DELETE FROM activity_log WHERE location_id = $1 AND created_at < $2', [config.locationId, config.cutoffAt]);
  }

  const expenses = await tx.query(
    `WITH moved AS (
      INSERT INTO expenses_archive
      SELECT * FROM expenses
      WHERE location_id = $1 AND expense_date < $2::date
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM moved`,
    [config.locationId, config.cutoffAt]
  );
  counts.expenses = expenses.rows[0].count;
  if (counts.expenses > 0) {
    await tx.query('DELETE FROM expenses WHERE location_id = $1 AND expense_date < $2::date', [config.locationId, config.cutoffAt]);
  }

  const staffPayments = await tx.query(
    `WITH moved AS (
      INSERT INTO staff_payments_archive
      SELECT * FROM staff_payments
      WHERE location_id = $1 AND payment_date < $2::date
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM moved`,
    [config.locationId, config.cutoffAt]
  );
  counts.staff_payments = staffPayments.rows[0].count;
  if (counts.staff_payments > 0) {
    await tx.query('DELETE FROM staff_payments WHERE location_id = $1 AND payment_date < $2::date', [config.locationId, config.cutoffAt]);
  }

  return counts;
}

export async function runArchiveForLocation({ locationId, userId = null, runType = 'scheduled' }) {
  const settings = await ensureArchiveSettings(locationId, userId);
  if (!settings.enabled) {
    await query(
      `INSERT INTO archive_runs (location_id, triggered_by, run_type, status, cutoff_at, details)
       VALUES ($1, $2, $3, 'skipped', CURRENT_TIMESTAMP, $4)`,
      [locationId, userId, runType, JSON.stringify({ reason: 'disabled' })]
    );
    return { skipped: true, reason: 'disabled' };
  }

  const retentionMonths = Number(settings.retention_months || 6);
  const cutoffResult = await query(`SELECT (CURRENT_TIMESTAMP - ($1::text || ' months')::interval) AS cutoff_at`, [retentionMonths]);
  const cutoffAt = cutoffResult.rows[0].cutoff_at;

  try {
    const details = await withTransaction(async (tx) => {
      const counts = await moveRowsToArchive(tx, { locationId, cutoffAt });
      await tx.query(
        `UPDATE archive_settings
         SET last_run_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = COALESCE($2, updated_by)
         WHERE location_id = $1`,
        [locationId, userId]
      );

      await tx.query(
        `INSERT INTO archive_runs (location_id, triggered_by, run_type, status, cutoff_at, details)
         VALUES ($1, $2, $3, 'success', $4, $5)`,
        [locationId, userId, runType, cutoffAt, JSON.stringify(counts)]
      );

      await createArchiveNotification(
        tx,
        locationId,
        'Archive run completed',
        `History archiving finished. Batches: ${counts.inventory_batches}, Sales: ${counts.sales}, Inventory logs: ${counts.inventory_movements}, Activity logs: ${counts.activity_log}, Expenses: ${counts.expenses}, Staff payments: ${counts.staff_payments}.`,
        'archive_completed'
      );

      return counts;
    });

    return { skipped: false, cutoffAt, details };
  } catch (err) {
    await query(
      `INSERT INTO archive_runs (location_id, triggered_by, run_type, status, cutoff_at, details, error_message)
       VALUES ($1, $2, $3, 'failed', $4, $5, $6)`,
      [locationId, userId, runType, cutoffAt, JSON.stringify({ error: true }), err.message]
    );
    throw err;
  }
}

export async function runScheduledArchive() {
  const lockResult = await withAdvisoryJobLock(JOB_LOCK_KEYS.ARCHIVE_SCHEDULER, async () => {
    const locations = await getLocationsToProcess();
    for (const location of locations) {
      try {
        const settings = await ensureArchiveSettings(location.id);
        const lastReminderAgo = settings.last_reminder_at ? Date.now() - new Date(settings.last_reminder_at).getTime() : Number.MAX_SAFE_INTEGER;
        const sixMonthsMs = 1000 * 60 * 60 * 24 * 30 * 6;
        if (lastReminderAgo >= sixMonthsMs) {
          await withTransaction(async (tx) => {
            await createArchiveNotification(
              tx,
              location.id,
              'Archive reminder',
              'Your branch history can be archived to keep active data clean. Review Admin > History Lifecycle settings.',
              'archive_reminder'
            );
            await tx.query('UPDATE archive_settings SET last_reminder_at = CURRENT_TIMESTAMP WHERE location_id = $1', [location.id]);
          });
        }
        await runArchiveForLocation({ locationId: location.id, runType: 'scheduled' });
      } catch (err) {
        console.error(`[ARCHIVE] Failed scheduled run for location ${location.id}:`, err.message);
      }
    }
  });

  if (lockResult.skipped) {
    console.log('[ARCHIVE] Skipping scheduled run: lock not acquired');
  }
}

export function startArchiveScheduler() {
  const oneDayMs = 1000 * 60 * 60 * 24;
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const delay = nextMidnight.getTime() - now.getTime();

  setTimeout(async () => {
    await runScheduledArchive();
    setInterval(() => {
      runScheduledArchive().catch((err) => console.error('[ARCHIVE] recurring schedule failed:', err.message));
    }, oneDayMs);
  }, delay);
}

export async function getArchiveDashboard(locationId) {
  const settings = await ensureArchiveSettings(locationId);
  const recentRuns = await query(
    `SELECT id, run_type, status, cutoff_at, details, error_message, created_at
     FROM archive_runs
     WHERE location_id = $1
     ORDER BY created_at DESC
     LIMIT 15`,
    [locationId]
  );
  const archiveCounts = await query(
    `SELECT
      (SELECT COUNT(*)::int FROM inventory_batches_archive WHERE location_id = $1) AS inventory_batches,
      (SELECT COUNT(*)::int FROM batch_items_archive bia JOIN inventory_batches_archive iba ON iba.id = bia.batch_id WHERE iba.location_id = $1) AS batch_items,
      (SELECT COUNT(*)::int FROM sales_archive WHERE location_id = $1) AS sales,
      (SELECT COUNT(*)::int FROM inventory_movements_archive WHERE location_id = $1) AS inventory_movements,
      (SELECT COUNT(*)::int FROM activity_log_archive WHERE location_id = $1) AS activity_log,
      (SELECT COUNT(*)::int FROM expenses_archive WHERE location_id = $1) AS expenses,
      (SELECT COUNT(*)::int FROM staff_payments_archive WHERE location_id = $1) AS staff_payments`,
    [locationId]
  );

  return {
    settings,
    recent_runs: recentRuns.rows,
    archive_counts: archiveCounts.rows[0],
    confirmation_phrase: settings.confirmation_phrase || DEFAULT_CONFIRMATION_PHRASE,
  };
}

export async function updateArchiveSettings({ locationId, userId, enabled, retentionMonths, coldStorageAfterMonths }) {
  await ensureArchiveSettings(locationId, userId);
  const result = await query(
    `UPDATE archive_settings
     SET enabled = COALESCE($2, enabled),
         retention_months = COALESCE($3, retention_months),
         cold_storage_after_months = COALESCE($4, cold_storage_after_months),
         updated_by = $5,
         updated_at = CURRENT_TIMESTAMP
     WHERE location_id = $1
     RETURNING *`,
    [locationId, enabled, retentionMonths, coldStorageAfterMonths, userId]
  );
  return result.rows[0];
}

export { DEFAULT_CONFIRMATION_PHRASE };
