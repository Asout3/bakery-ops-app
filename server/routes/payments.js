import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();
const STAFF_PAYMENT_EDIT_WINDOW_MINUTES = 20;


async function resolveEffectiveActor(tx, req, locationId) {
  const queuedActorIdHeader = req.headers['x-offline-actor-id'];
  const isFromOfflineQueue = req.headers['x-queued-request'] === 'true';
  if (!isFromOfflineQueue || !queuedActorIdHeader) return req.user.id;

  const actorResult = await tx.query(
    'SELECT id FROM users WHERE id = $1 AND location_id = $2',
    [Number(queuedActorIdHeader), locationId]
  );
  return actorResult.rows.length ? Number(actorResult.rows[0].id) : req.user.id;
}

router.get('/', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    let queryText = `
      SELECT sp.*, CONCAT('PAY-', LPAD(sp.id::text, 6, '0')) as payment_code,
             COALESCE(u.username, fp.full_name) as staff_name,
             COALESCE(u.role, fp.role_preference) as role,
             uc.username as created_by_name,
             COALESCE(CASE WHEN sp.notes LIKE '{%' THEN NULLIF(sp.notes::jsonb ->> 'payment_frequency', '') END, 'monthly') as payment_frequency,
             COALESCE(CASE WHEN sp.notes LIKE '{%' THEN NULLIF(sp.notes::jsonb ->> 'payout_mode', '') END, 'pay_now') as payout_mode,
             CASE WHEN sp.notes LIKE '{%' THEN NULLIF(sp.notes::jsonb ->> 'payroll_month', '') END as payroll_month,
             ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') < (sp.created_at + make_interval(mins => $2::int))) as can_edit,
             EXTRACT(EPOCH FROM ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - sp.created_at)) / 60 as age_minutes
      FROM staff_payments sp
      LEFT JOIN users u ON sp.user_id = u.id
      LEFT JOIN staff_profiles fp ON sp.staff_profile_id = fp.id
      LEFT JOIN users uc ON sp.created_by = uc.id
      WHERE sp.location_id = $1
    `;

    const locationId = await getTargetLocationId(req, query);
    const params = [locationId, STAFF_PAYMENT_EDIT_WINDOW_MINUTES];

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
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'PAYMENT_FETCH_ERROR', requestId: req.requestId });
  }
});

router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('payment_date').isDate().withMessage('Valid payment date is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    const { staff_profile_id, user_id, amount, payment_date, payment_type, payment_frequency, payout_mode, payroll_month, notes } = req.body;

    if (!staff_profile_id && !user_id) {
      return res.status(400).json({ error: 'Either staff_profile_id or user_id is required', code: 'VALIDATION_ERROR', requestId: req.requestId });
    }
    if (staff_profile_id && user_id) {
      return res.status(400).json({ error: 'Provide only one of staff_profile_id or user_id', code: 'VALIDATION_ERROR', requestId: req.requestId });
    }

    const idempotencyKey = req.headers['x-idempotency-key'];

    try {
      const locationId = await getTargetLocationId(req, query);
      const resolvedUserId = user_id ? Number(user_id) : null;
      const resolvedStaffProfileId = staff_profile_id ? Number(staff_profile_id) : null;

      let staffName = 'Unknown';

      if (resolvedStaffProfileId) {
        const staffResult = await query('SELECT full_name FROM staff_profiles WHERE id = $1 AND location_id = $2', [resolvedStaffProfileId, locationId]);
        if (!staffResult.rows.length) {
          return res.status(400).json({ error: 'Invalid staff profile for this branch', code: 'INVALID_STAFF_PROFILE', requestId: req.requestId });
        }
        staffName = staffResult.rows[0].full_name;
      } else if (resolvedUserId) {
        const userResult = await query('SELECT username FROM users WHERE id = $1 AND location_id = $2', [resolvedUserId, locationId]);
        if (!userResult.rows.length) {
          return res.status(400).json({ error: 'Invalid user for this branch', code: 'INVALID_USER', requestId: req.requestId });
        }
        staffName = userResult.rows[0].username;
      }

      const result = await withTransaction(async (tx) => {
        const effectiveActorId = await resolveEffectiveActor(tx, req, locationId);
        if (idempotencyKey) {
          const existing = await tx.query(
            `SELECT response_payload FROM idempotency_keys
             WHERE user_id = $1 AND idempotency_key = $2`,
            [effectiveActorId, idempotencyKey]
          );
          if (existing.rows.length > 0) {
            return existing.rows[0].response_payload;
          }
        }

        const paymentResult = await tx.query(
          `INSERT INTO staff_payments (user_id, staff_profile_id, location_id, amount, payment_date, payment_type, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [resolvedUserId, resolvedStaffProfileId, locationId, amount, payment_date, payment_type || 'salary', JSON.stringify({ notes: notes || '', payment_frequency: payment_frequency || 'monthly', payout_mode: payout_mode || 'pay_now', payroll_month: payroll_month || null }), effectiveActorId]
        );

        const payment = paymentResult.rows[0];

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            effectiveActorId,
            locationId,
            'payment_created',
            `Staff payment: ${amount} to ${staffName}`,
            JSON.stringify({ payment_id: payment.id, staff_name: staffName, amount, synced_by_user_id: req.user.id }),
          ]
        );

        await tx.query(
          `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
           SELECT id, $1, 'Staff Payment Recorded', $2, 'staff_payment'
           FROM users
           WHERE role IN ('admin', 'manager') AND is_active = true AND (location_id = $1 OR location_id IS NULL)`,
          [locationId, `${staffName} was paid ETB ${Number(amount).toFixed(2)}.`]
        );

        if (idempotencyKey) {
          await tx.query(
            `INSERT INTO idempotency_keys (user_id, location_id, idempotency_key, endpoint, response_payload)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
            [effectiveActorId, locationId, idempotencyKey, '/api/payments', JSON.stringify(payment)]
          );
        }

        return payment;
      });

      res.status(201).json(result);
    } catch (err) {
      console.error('Create staff payment error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code || 'PAYMENT_CREATE_ERROR', requestId: req.requestId });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('admin'),
  body('amount').optional().isFloat({ min: 0 }),
  body('payment_date').optional().isDate(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    const { amount, payment_date, payment_type, payment_frequency, payout_mode, payroll_month, notes } = req.body;

    try {
      const locationId = await getTargetLocationId(req, query);
      const updated = await withTransaction(async (tx) => {
        const existing = await tx.query(
          `SELECT *,
                  ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') < (created_at + make_interval(mins => $2::int))) as can_edit,
                  EXTRACT(EPOCH FROM ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - created_at)) / 60 as age_minutes
           FROM staff_payments
           WHERE id = $1 AND location_id = $3
           FOR UPDATE`,
          [req.params.id, STAFF_PAYMENT_EDIT_WINDOW_MINUTES, locationId]
        );

        if (!existing.rows.length) {
          const err = new Error('Payment not found');
          err.status = 404;
          throw err;
        }

        const payment = existing.rows[0];
        if (!payment.can_edit) {
          const err = new Error(`Payments can only be edited within ${STAFF_PAYMENT_EDIT_WINDOW_MINUTES} minutes. This payment is ${Math.floor(Number(payment.age_minutes || 0))} minutes old.`);
          err.status = 403;
          err.code = 'STAFF_PAYMENT_EDIT_WINDOW_EXPIRED';
          throw err;
        }

        const result = await tx.query(
          `UPDATE staff_payments
           SET amount = COALESCE($1, amount),
               payment_date = COALESCE($2, payment_date),
               payment_type = COALESCE($3, payment_type),
               notes = COALESCE($4, notes)
           WHERE id = $5 AND location_id = $6
           RETURNING *`,
          [amount || null, payment_date || null, payment_type || null, JSON.stringify({ notes: notes || '', payment_frequency: payment_frequency || 'monthly', payout_mode: payout_mode || 'pay_now', payroll_month: payroll_month || null }), req.params.id, locationId]
        );

        return result.rows[0];
      });

      res.json(updated);
    } catch (err) {
      console.error('Update payment error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code || 'PAYMENT_UPDATE_ERROR' });
    }
  }
);

router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    await withTransaction(async (tx) => {
      const existing = await tx.query(
        `SELECT *,
                ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') < (created_at + make_interval(mins => $2::int))) as can_edit,
                EXTRACT(EPOCH FROM ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - created_at)) / 60 as age_minutes
         FROM staff_payments
         WHERE id = $1 AND location_id = $3
         FOR UPDATE`,
        [req.params.id, STAFF_PAYMENT_EDIT_WINDOW_MINUTES, locationId]
      );

      if (!existing.rows.length) {
        const err = new Error('Payment not found');
        err.status = 404;
        throw err;
      }

      const payment = existing.rows[0];
      if (!payment.can_edit) {
        const err = new Error(`Payments can only be deleted within ${STAFF_PAYMENT_EDIT_WINDOW_MINUTES} minutes. This payment is ${Math.floor(Number(payment.age_minutes || 0))} minutes old.`);
        err.status = 403;
        err.code = 'STAFF_PAYMENT_EDIT_WINDOW_EXPIRED';
        throw err;
      }

      await tx.query('DELETE FROM staff_payments WHERE id = $1 AND location_id = $2', [req.params.id, payment.location_id]);
    });

    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    console.error('Delete payment error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code || 'PAYMENT_DELETE_ERROR' });
  }
});

router.get('/summary', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
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

    const locationId = await getTargetLocationId(req, query);
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
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'PAYMENT_SUMMARY_FETCH_ERROR', requestId: req.requestId });
  }
});

export default router;
