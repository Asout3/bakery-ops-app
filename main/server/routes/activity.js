import express from 'express';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();

// Get activity log
function clampLimit(value, fallback = 100, max = 500) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(10, Math.min(max, parsed));
}

router.get('/', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const limit = clampLimit(req.query.limit, 100, 500);
    const activityType = req.query.activity_type;

    let queryText = `
      SELECT a.*, u.username
      FROM activity_log a
      JOIN users u ON a.user_id = u.id
      WHERE a.location_id = $1
    `;

    const params = [locationId];

    if (activityType) {
      params.push(activityType);
      queryText += ` AND a.activity_type = $${params.length}`;
    }

    queryText += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get activity log error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'ACTIVITY_FETCH_ERROR', requestId: req.requestId });
  }
});

export default router;
