import express from 'express';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';
import { CASHIER_NOTIFICATION_TYPES, MANAGER_NOTIFICATION_TYPES } from '../services/notificationDispatchService.js';

const router = express.Router();
const MANAGER_ALLOWED_NOTIFICATION_TYPES = MANAGER_NOTIFICATION_TYPES;
const CASHIER_ALLOWED_NOTIFICATION_TYPES = CASHIER_NOTIFICATION_TYPES;

router.get('/rules', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const result = await query('SELECT * FROM alert_rules WHERE location_id = $1 ORDER BY event_type', [locationId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Get alert rules error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'ALERT_RULE_FETCH_ERROR', requestId: req.requestId });
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
    res.status(500).json({ error: 'Internal server error', code: 'ALERT_RULE_CREATE_ERROR', requestId: req.requestId });
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
      return res.status(404).json({ error: 'Rule not found', code: 'ALERT_RULE_NOT_FOUND', requestId: req.requestId });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update alert rule error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'ALERT_RULE_UPDATE_ERROR', requestId: req.requestId });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const unreadOnly = req.query.unread_only === 'true';
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 50;

    let queryText = `SELECT * FROM notifications WHERE user_id = $1`;
    const params = [req.user.id];
    if (req.user.role === 'manager') {
      params.push(MANAGER_ALLOWED_NOTIFICATION_TYPES);
      queryText += ` AND notification_type = ANY($${params.length}::text[])`;
    } else if (req.user.role === 'cashier') {
      params.push(CASHIER_ALLOWED_NOTIFICATION_TYPES);
      queryText += ` AND notification_type = ANY($${params.length}::text[])`;
    }
    if (unreadOnly) queryText += ' AND is_read = false';
    params.push(limit);
    queryText += ` ORDER BY is_read ASC, created_at DESC, id DESC LIMIT $${params.length}`;

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'NOTIFICATIONS_FETCH_ERROR', requestId: req.requestId });
  }
});

router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'NOTIFICATIONS_MARK_ALL_READ_ERROR', requestId: req.requestId });
  }
});

router.put('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'NOTIFICATIONS_MARK_ALL_READ_ERROR', requestId: req.requestId });
  }
});

router.get('/unread/count', authenticateToken, async (req, res) => {
  try {
    const params = [req.user.id];
    let queryText = 'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = $1 AND is_read = false';
    if (req.user.role === 'manager') {
      params.push(MANAGER_ALLOWED_NOTIFICATION_TYPES);
      queryText += ` AND notification_type = ANY($${params.length}::text[])`;
    } else if (req.user.role === 'cashier') {
      params.push(CASHIER_ALLOWED_NOTIFICATION_TYPES);
      queryText += ` AND notification_type = ANY($${params.length}::text[])`;
    }
    const result = await query(queryText, params);
    res.json({ unread_count: parseInt(result.rows[0].unread_count, 10) });
  } catch (err) {
    console.error('Get unread count error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'NOTIFICATIONS_UNREAD_COUNT_ERROR', requestId: req.requestId });
  }
});

router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found', code: 'NOTIFICATION_NOT_FOUND', requestId: req.requestId });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'NOTIFICATION_MARK_READ_ERROR', requestId: req.requestId });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found', code: 'NOTIFICATION_NOT_FOUND', requestId: req.requestId });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'NOTIFICATION_MARK_READ_ERROR', requestId: req.requestId });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found', code: 'NOTIFICATION_NOT_FOUND', requestId: req.requestId });
    }

    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'NOTIFICATION_DELETE_ERROR', requestId: req.requestId });
  }
});

export default router;
