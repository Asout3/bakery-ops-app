import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Get staff payments
router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    let queryText = `
      SELECT sp.*, u.username as staff_name, u.role,
             uc.username as created_by_name
      FROM staff_payments sp
      JOIN users u ON sp.user_id = u.id
      JOIN users uc ON sp.created_by = uc.id
      WHERE sp.location_id = $1
    `;

    const params = [locationId];

    if (startDate) {
      params.push(startDate);
      queryText += ` AND sp.payment_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND sp.payment_date <= $${params.length}`;
    }

    queryText += ' ORDER BY sp.payment_date DESC, sp.created_at DESC';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get staff payments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create staff payment
router.post('/',
  authenticateToken,
  authorizeRoles('admin'),
  body('user_id').isInt(),
  body('amount').isFloat({ min: 0 }),
  body('payment_date').isDate(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_id, amount, payment_date, payment_type, notes } = req.body;
    const locationId = req.user.location_id;

    try {
      const result = await query(
        `INSERT INTO staff_payments (user_id, location_id, amount, payment_date, payment_type, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [user_id, locationId, amount, payment_date, payment_type || 'salary', notes || null, req.user.id]
      );

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          req.user.id,
          locationId,
          'payment_created',
          `Staff payment: ${amount} to user ${user_id}`,
          JSON.stringify({ payment_id: result.rows[0].id, user_id, amount })
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create staff payment error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get staff payment summary
router.get('/summary', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    let queryText = `
      SELECT u.id, u.username, u.role,
             SUM(sp.amount) as total_paid,
             COUNT(*) as payment_count
      FROM staff_payments sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.location_id = $1
    `;

    const params = [locationId];

    if (startDate) {
      params.push(startDate);
      queryText += ` AND sp.payment_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND sp.payment_date <= $${params.length}`;
    }

    queryText += ' GROUP BY u.id, u.username, u.role ORDER BY total_paid DESC';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get payment summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
