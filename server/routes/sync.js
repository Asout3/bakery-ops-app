import express from 'express';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../utils/errors.js';

const router = express.Router();

router.post('/audit/bulk', authenticateToken, asyncHandler(async (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!events.length) {
    return res.json({ inserted: 0 });
  }

  let inserted = 0;
  for (const event of events.slice(0, 200)) {
    const status = String(event?.status || '');
    if (!['synced', 'failed', 'conflict', 'needs_review'].includes(status)) continue;

    const operationId = String(event?.operation_id || '').trim();
    if (!operationId) continue;

    const locationId = req.user.role === 'admin'
      ? (event.location_id ? Number(event.location_id) : (req.user.location_id ? Number(req.user.location_id) : null))
      : (req.user.location_id ? Number(req.user.location_id) : null);

    await query(
      `INSERT INTO sync_audit_logs
        (operation_id, actor_user_id, actor_username, location_id, method, endpoint, status, reason, retry_count, metadata, created_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::jsonb, '{}'::jsonb), COALESCE($11::timestamptz, NOW()))`,
      [
        operationId,
        req.user.id,
        req.user.username || null,
        locationId,
        event.method ? String(event.method).toUpperCase() : null,
        event.url ? String(event.url) : null,
        status,
        event.reason ? String(event.reason) : null,
        Number(event.retry_count || 0),
        event.metadata ? JSON.stringify(event.metadata) : '{}',
        event.created_at || null,
      ]
    );
    inserted += 1;
  }

  return res.json({ inserted });
}));

router.get('/audit', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const limit = Math.min(500, Math.max(10, Number(req.query.limit || 200)));
  const locationId = req.query.location_id ? Number(req.query.location_id) : null;
  const status = req.query.status ? String(req.query.status) : null;

  const params = [];
  let where = 'WHERE 1=1';

  if (locationId) {
    params.push(locationId);
    where += ` AND location_id = $${params.length}`;
  }

  if (status && ['synced', 'failed', 'conflict', 'needs_review', 'resolved', 'ignored'].includes(status)) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  params.push(limit);

  const logs = await query(
    `SELECT id, operation_id, actor_user_id, actor_username, location_id, method, endpoint, status, reason,
            retry_count, metadata, created_at, resolved_at, resolved_by_user_id, resolution_note
     FROM sync_audit_logs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return res.json(logs.rows);
}));

router.patch('/audit/:operationId', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const operationId = String(req.params.operationId || '').trim();
  const status = String(req.body?.status || '').trim();
  const note = req.body?.note ? String(req.body.note).trim() : null;

  if (!operationId) {
    throw new AppError('operationId is required', 400, 'VALIDATION_ERROR');
  }

  if (!['resolved', 'ignored'].includes(status)) {
    throw new AppError('status must be resolved or ignored', 400, 'VALIDATION_ERROR');
  }

  const updated = await query(
    `UPDATE sync_audit_logs
     SET status = $1,
         resolved_at = NOW(),
         resolved_by_user_id = $2,
         resolution_note = COALESCE($3, resolution_note)
     WHERE operation_id = $4
       AND status IN ('failed', 'conflict', 'needs_review')
     RETURNING id, operation_id, status, resolved_at, resolved_by_user_id, resolution_note`,
    [status, req.user.id, note, operationId]
  );

  if (!updated.rows.length) {
    throw new AppError('No active issue found for this operation', 404, 'NOT_FOUND');
  }

  return res.json(updated.rows[0]);
}));

export default router;
