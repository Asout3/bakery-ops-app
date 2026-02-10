import express from 'express';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();

router.get('/rules', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const result = await query('SELECT * FROM alert_rules WHERE location_id = $1 ORDER BY event_type', [locationId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Get alert rules error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/rules', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const { event_type, threshold, enabled = true } = req.body;

    const result = await query(
      `INSERT INTO alert_rules (location_id, event_type, threshold, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [locationId, event_type, threshold, enabled, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create alert rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/rules/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { threshold, enabled } = req.body;
    const result = await query(
      `UPDATE alert_rules
       SET threshold = COALESCE($1, threshold),
           enabled = COALESCE($2, enabled),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [threshold, enabled, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update alert rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const unreadOnly = req.query.unread_only === 'true';
    const limit = parseInt(req.query.limit, 10) || 50;

    let queryText = `SELECT * FROM notifications WHERE user_id = $1`;
    if (unreadOnly) queryText += ' AND is_read = false';
    queryText += ' ORDER BY created_at DESC LIMIT $2';

    const result = await query(queryText, [req.user.id, limit]);
    res.json(result.rows);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/unread/count', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = $1 AND is_read = false', [req.user.id]);
    res.json({ unread_count: parseInt(result.rows[0].unread_count, 10) });
  } catch (err) {
    console.error('Get unread count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
