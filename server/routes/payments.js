import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();

// Get staff payments
router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
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
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
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

    const { user_id, amount, payment_date, payment_type, notes, location_id } = req.body;

    try {
      const locationId = await getTargetLocationId({ ...req, query: { ...req.query, location_id } }, query);
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
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);



// Update staff payment
router.put('/:id',
  authenticateToken,
  authorizeRoles('admin'),
  body('user_id').optional().isInt(),
  body('amount').optional().isFloat({ min: 0 }),
  body('payment_date').optional().isDate(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_id, amount, payment_date, payment_type, notes, location_id } = req.body;

    try {
      const targetLocationId = await getTargetLocationId({ ...req, query: { ...req.query, location_id } }, query);
      const result = await query(
        `UPDATE staff_payments
         SET user_id = COALESCE($1, user_id),
             amount = COALESCE($2, amount),
             payment_date = COALESCE($3, payment_date),
             payment_type = COALESCE($4, payment_type),
             notes = COALESCE($5, notes),
             location_id = COALESCE($6, location_id)
         WHERE id = $7
         RETURNING *`,
        [user_id || null, amount || null, payment_date || null, payment_type || null, notes || null, targetLocationId || null, req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update payment error:', err);
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete staff payment
router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await query('DELETE FROM staff_payments WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    console.error('Delete payment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get staff payment summary
router.get('/summary', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
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
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
