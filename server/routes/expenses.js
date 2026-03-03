import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();
const EXPENSE_EDIT_WINDOW_MINUTES = 20;

// Get expenses
router.get('/', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;
    const category = req.query.category;

    let queryText = `
      SELECT e.*, u.username as created_by_name
      FROM expenses e
      JOIN users u ON e.created_by = u.id
      WHERE e.location_id = $1
    `;

    const params = [locationId];

    if (startDate) {
      params.push(startDate);
      queryText += ` AND e.expense_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND e.expense_date <= $${params.length}`;
    }

    if (category) {
      params.push(category);
      queryText += ` AND e.category = $${params.length}`;
    }

    queryText += ' ORDER BY e.expense_date DESC, e.created_at DESC';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get expenses error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// Create expense
router.post('/',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('category').trim().notEmpty(),
  body('amount').isFloat({ min: 0 }),
  body('expense_date').isDate(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { category, description, amount, expense_date } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'];

    try {
      const locationId = await getTargetLocationId(req, query);
      const expense = await withTransaction(async (tx) => {
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

        const result = await tx.query(
          `INSERT INTO expenses (location_id, category, description, amount, expense_date, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [locationId, category, description || null, amount, expense_date, req.user.id]
        );

        await tx.query(
          `INSERT INTO kpi_events (location_id, user_id, event_type, event_value, metadata)
           VALUES ($1, $2, 'expense_created', $3, $4)`,
          [locationId, req.user.id, amount, JSON.stringify({ expense_id: result.rows[0].id, category })]
        );

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            req.user.id,
            locationId,
            'expense_created',
            `Created expense: ${category} - ${amount}`,
            JSON.stringify({ expense_id: result.rows[0].id, category, amount })
          ]
        );

        if (idempotencyKey) {
          await tx.query(
            `INSERT INTO idempotency_keys (user_id, location_id, idempotency_key, endpoint, response_payload)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
            [req.user.id, locationId, idempotencyKey, '/api/expenses', JSON.stringify(result.rows[0])]
          );
        }

        return result.rows[0];
      });

      res.status(201).json(expense);
    } catch (err) {
      console.error('Create expense error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
    }
  }
);

// Update expense
router.put('/:id',
  authenticateToken,
  authorizeRoles('admin'),
  async (req, res) => {
    const { category, description, amount, expense_date, reason } = req.body;

    try {
      const updated = await withTransaction(async (tx) => {
        const existing = await tx.query(
          `SELECT *,
                  (CURRENT_TIMESTAMP < (created_at + make_interval(mins => $2::int))) as can_edit,
                  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 60 as age_minutes
           FROM expenses
           WHERE id = $1
           FOR UPDATE`,
          [req.params.id, EXPENSE_EDIT_WINDOW_MINUTES]
        );

        if (!existing.rows.length) {
          const err = new Error('Expense not found');
          err.status = 404;
          throw err;
        }

        const expense = existing.rows[0];
        if (!expense.can_edit) {
          const err = new Error(`Expenses can only be edited within ${EXPENSE_EDIT_WINDOW_MINUTES} minutes. This expense is ${Math.floor(Number(expense.age_minutes || 0))} minutes old.`);
          err.status = 403;
          err.code = 'EXPENSE_EDIT_WINDOW_EXPIRED';
          throw err;
        }

        const result = await tx.query(
          `UPDATE expenses
           SET category = COALESCE($1, category),
               description = COALESCE($2, description),
               amount = COALESCE($3, amount),
               expense_date = COALESCE($4, expense_date)
           WHERE id = $5
           RETURNING *`,
          [category, description, amount, expense_date, req.params.id]
        );

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
           VALUES ($1, $2, 'expense_updated', $3, $4)`,
          [
            req.user.id,
            expense.location_id,
            `Updated expense ${expense.id}`,
            JSON.stringify({ expense_id: expense.id, reason: reason || 'No reason provided' })
          ]
        );

        return result.rows[0];
      });

      res.json(updated);
    } catch (err) {
      console.error('Update expense error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code || 'EXPENSE_UPDATE_ERROR', requestId: req.requestId });
    }
  }
);

// Delete expense
router.delete('/:id',
  authenticateToken,
  authorizeRoles('admin'),
  async (req, res) => {
    try {
      await withTransaction(async (tx) => {
        const existing = await tx.query(
          `SELECT *,
                  (CURRENT_TIMESTAMP < (created_at + make_interval(mins => $2::int))) as can_edit,
                  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 60 as age_minutes
           FROM expenses
           WHERE id = $1
           FOR UPDATE`,
          [req.params.id, EXPENSE_EDIT_WINDOW_MINUTES]
        );

        if (!existing.rows.length) {
          const err = new Error('Expense not found');
          err.status = 404;
          throw err;
        }

        const expense = existing.rows[0];
        if (!expense.can_edit) {
          const err = new Error(`Expenses can only be deleted within ${EXPENSE_EDIT_WINDOW_MINUTES} minutes. This expense is ${Math.floor(Number(expense.age_minutes || 0))} minutes old.`);
          err.status = 403;
          err.code = 'EXPENSE_EDIT_WINDOW_EXPIRED';
          throw err;
        }

        await tx.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
           VALUES ($1, $2, 'expense_deleted', $3, $4)`,
          [req.user.id, expense.location_id, `Deleted expense ${expense.id}`, JSON.stringify({ expense_id: expense.id })]
        );
      });

      res.json({ message: 'Expense deleted successfully' });
    } catch (err) {
      console.error('Delete expense error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code || 'EXPENSE_DELETE_ERROR', requestId: req.requestId });
    }
  }
);

// Get expense categories summary
router.get('/summary/categories', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    let queryText = `
      SELECT category, 
             SUM(amount) as total_amount,
             COUNT(*) as count
      FROM expenses
      WHERE location_id = $1
    `;

    const params = [locationId];

    if (startDate) {
      params.push(startDate);
      queryText += ` AND expense_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND expense_date <= $${params.length}`;
    }

    queryText += ' GROUP BY category ORDER BY total_amount DESC';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get expense summary error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
