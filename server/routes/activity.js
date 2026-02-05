import express from 'express';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get activity log
router.get('/', authenticateToken, async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
    const limit = parseInt(req.query.limit) || 100;
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
