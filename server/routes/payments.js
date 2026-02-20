import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    let queryText = `
      SELECT sp.*, 
             COALESCE(u.username, fp.full_name) as staff_name, 
             COALESCE(u.role, fp.role_preference) as role,
             uc.username as created_by_name,
             l.name as location_name
      FROM staff_payments sp
      LEFT JOIN users u ON sp.user_id = u.id
      LEFT JOIN staff_profiles fp ON sp.staff_profile_id = fp.id
      LEFT JOIN users uc ON sp.created_by = uc.id
      LEFT JOIN locations l ON sp.location_id = l.id
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

router.post('/',
  authenticateToken,
  authorizeRoles('admin'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('payment_date').isDate().withMessage('Valid payment date is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { staff_profile_id, user_id, amount, payment_date, payment_type, notes, location_id } = req.body;
    
    if (!staff_profile_id && !user_id) {
      return res.status(400).json({ error: 'Either staff_profile_id or user_id is required' });
    }

    const idempotencyKey = req.headers['x-idempotency-key'];

    try {
      const targetLocationId = await getTargetLocationId({ headers: req.headers, query: { ...req.query, location_id }, user: req.user }, query);
      
      const resolvedUserId = user_id ? Number(user_id) : null;
      const resolvedStaffProfileId = staff_profile_id ? Number(staff_profile_id) : null;
      
      let staffName = 'Unknown';
      let staffLocationId = targetLocationId;
      
      if (resolvedStaffProfileId) {
        const staffResult = await query('SELECT full_name, location_id FROM staff_profiles WHERE id = $1', [resolvedStaffProfileId]);
        if (staffResult.rows.length > 0) {
          staffName = staffResult.rows[0].full_name;
          if (staffResult.rows[0].location_id) {
            staffLocationId = staffResult.rows[0].location_id;
          }
        }
      } else if (resolvedUserId) {
        const userResult = await query('SELECT username, location_id FROM users WHERE id = $1', [resolvedUserId]);
        if (userResult.rows.length > 0) {
          staffName = userResult.rows[0].username;
        }
      }
      
      const result = await withTransaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.query(
            `SELECT response_payload FROM idempotency_keys
             WHERE user_id = $1 AND idempotency_key = $2`,
            [req.user.id, idempotencyKey]
          );
          if (existing.rows.length > 0) {
            return existing.rows[0].response_payload;
          }
        }

        const paymentResult = await tx.query(
          `INSERT INTO staff_payments (user_id, staff_profile_id, location_id, amount, payment_date, payment_type, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [resolvedUserId, resolvedStaffProfileId, staffLocationId, amount, payment_date, payment_type || 'salary', notes || null, req.user.id]
        );

        const payment = paymentResult.rows[0];

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            req.user.id,
            staffLocationId,
            'payment_created',
            `Staff payment: ${amount} to ${staffName}`,
            JSON.stringify({ payment_id: payment.id, staff_name: staffName, amount })
          ]
        );

        if (idempotencyKey) {
          await tx.query(
            `INSERT INTO idempotency_keys (user_id, location_id, idempotency_key, endpoint, response_payload)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
            [req.user.id, staffLocationId, idempotencyKey, '/api/payments', JSON.stringify(payment)]
          );
        }

        return payment;
      });

      res.status(201).json(result);
    } catch (err) {
      console.error('Create staff payment error:', err);
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put('/:id',
  authenticateToken,
  authorizeRoles('admin'),
  body('amount').optional().isFloat({ min: 0 }),
  body('payment_date').optional().isDate(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, payment_date, payment_type, notes, location_id } = req.body;

    try {
      const targetLocationId = await getTargetLocationId({ headers: req.headers, query: { ...req.query, location_id }, user: req.user }, query);
      const result = await query(
        `UPDATE staff_payments
         SET amount = COALESCE($1, amount),
             payment_date = COALESCE($2, payment_date),
             payment_type = COALESCE($3, payment_type),
             notes = COALESCE($4, notes),
             location_id = COALESCE($5, location_id)
         WHERE id = $6
         RETURNING *`,
        [amount || null, payment_date || null, payment_type || null, notes || null, targetLocationId || null, req.params.id]
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

router.get('/summary', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);

    let queryText = `
      SELECT 
        COALESCE(u.id, fp.id) as staff_id,
        COALESCE(u.username, fp.full_name) as staff_name,
        COALESCE(u.role, fp.role_preference) as role,
        SUM(sp.amount) as total_paid,
        COUNT(*) as payment_count
      FROM staff_payments sp
      LEFT JOIN users u ON sp.user_id = u.id
      LEFT JOIN staff_profiles fp ON sp.staff_profile_id = fp.id
      WHERE sp.location_id = $1
    `;

    const params = [locationId];

    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    if (startDate) {
      params.push(startDate);
      queryText += ` AND sp.payment_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND sp.payment_date <= $${params.length}`;
    }

    queryText += ' GROUP BY COALESCE(u.id, fp.id), COALESCE(u.username, fp.full_name), COALESCE(u.role, fp.role_preference) ORDER BY total_paid DESC';

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
