import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();
const EXPENSE_EDIT_WINDOW_MINUTES = 20;

function toISODateString(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function isCurrentDateValue(value) {
  return toISODateString(value) === new Date().toISOString().slice(0, 10);
}

async function resolveEffectiveActor(tx, req, locationId) {
  const queuedActorIdHeader = req.headers['x-offline-actor-id'];
  const isFromOfflineQueue = req.headers['x-queued-request'] === 'true';
  if (!isFromOfflineQueue || !queuedActorIdHeader) return req.user.id;

  const queuedActorId = Number(queuedActorIdHeader);
  const actorResult = await tx.query(
    'SELECT id FROM users WHERE id = $1 AND (location_id = $2 OR location_id IS NULL)',
    [queuedActorId, locationId]
  );
  if (!actorResult.rows.length || queuedActorId !== Number(req.user.id)) {
    const err = new Error('Offline actor mismatch is not allowed');
    err.status = 403;
    throw err;
  }

  return Number(actorResult.rows[0].id);
}

let expenseSchemaCache = { checkedAt: 0, hasExpenseCategoriesTable: false };

async function getExpenseSchemaSupport() {
  const now = Date.now();
  if (now - expenseSchemaCache.checkedAt < 60_000) {
    return expenseSchemaCache;
  }

  let hasExpenseCategoriesTable = false;
  try {
    const tableCheck = await query(
      `SELECT 1
       FROM information_schema.tables
       WHERE table_name = 'expense_categories'
       LIMIT 1`
    );
    hasExpenseCategoriesTable = tableCheck.rows.length > 0;

    if (!hasExpenseCategoriesTable) {
      try {
        await query(
          `CREATE TABLE IF NOT EXISTS expense_categories (
            id SERIAL PRIMARY KEY,
            location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(location_id, name)
          )`
        );
        await query(
          `INSERT INTO expense_categories (location_id, name, created_by)
           SELECT DISTINCT e.location_id, e.category, MIN(e.created_by)
           FROM expenses e
           LEFT JOIN expense_categories ec ON ec.location_id = e.location_id AND LOWER(ec.name) = LOWER(e.category)
           WHERE ec.id IS NULL
           GROUP BY e.location_id, e.category`
        );
        hasExpenseCategoriesTable = true;
      } catch {
        hasExpenseCategoriesTable = false;
      }
    }
  } catch {
    hasExpenseCategoriesTable = false;
  }

  expenseSchemaCache = { checkedAt: now, hasExpenseCategoriesTable };
  return expenseSchemaCache;
}

router.get('/categories', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const { hasExpenseCategoriesTable } = await getExpenseSchemaSupport();
    const visibilityFilter = req.user.role === 'manager' ? ' AND created_by = $2' : '';
    const visibilityParams = req.user.role === 'manager' ? [locationId, req.user.id] : [locationId];

    if (hasExpenseCategoriesTable) {
      const result = await query(
        `SELECT id, name, created_at
         FROM expense_categories
         WHERE location_id = $1${visibilityFilter}
         ORDER BY name ASC`,
        visibilityParams
      );
      return res.json(result.rows);
    }

    const fallback = await query(
      `SELECT NULL::int as id, category as name, MIN(created_at) as created_at
       FROM expenses
       WHERE location_id = $1 ${req.user.role === 'manager' ? 'AND created_by = $2' : ''}
       GROUP BY category
       ORDER BY category ASC`,
      visibilityParams
    );
    return res.json(fallback.rows);
  } catch (err) {
    console.error('Get expense categories error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'EXPENSE_CATEGORY_FETCH_ERROR', requestId: req.requestId });
  }
});

router.post('/categories',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('name').trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    try {
      const locationId = await getTargetLocationId(req, query);
      const name = req.body.name.trim();
      const { hasExpenseCategoriesTable } = await getExpenseSchemaSupport();

      if (!hasExpenseCategoriesTable) {
        return res.status(409).json({
          error: 'Expense category management requires schema migration. You can still create expenses by typing a category.',
          code: 'EXPENSE_CATEGORY_SCHEMA_MISSING',
          requestId: req.requestId,
        });
      }

      const result = await query(
        `INSERT INTO expense_categories (location_id, name, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (location_id, name) DO NOTHING
         RETURNING id, name, created_at`,
        [locationId, name, req.user.id]
      );

      if (!result.rows.length) {
        return res.status(409).json({ error: 'Category already exists', code: 'DUPLICATE_EXPENSE_CATEGORY', requestId: req.requestId });
      }

      return res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create expense category error:', err);
      return res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'EXPENSE_CATEGORY_CREATE_ERROR', requestId: req.requestId });
    }
  }
);

router.delete('/categories/:id', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const { hasExpenseCategoriesTable } = await getExpenseSchemaSupport();
    if (!hasExpenseCategoriesTable) {
      return res.status(409).json({ error: 'Expense category table is not available', code: 'EXPENSE_CATEGORY_SCHEMA_MISSING', requestId: req.requestId });
    }

    const category = await query('SELECT id, name, created_by FROM expense_categories WHERE id = $1 AND location_id = $2', [req.params.id, locationId]);
    if (!category.rows.length) {
      return res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND', requestId: req.requestId });
    }
    if (req.user.role === 'manager' && Number(category.rows[0].created_by) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You can only delete your own categories', code: 'EXPENSE_CATEGORY_FORBIDDEN', requestId: req.requestId });
    }

    const usage = await query(
      'SELECT COUNT(*)::int as total FROM expenses WHERE location_id = $1 AND LOWER(category) = LOWER($2)',
      [locationId, category.rows[0].name]
    );

    if (usage.rows[0].total > 0) {
      return res.status(409).json({ error: 'Category is already used by expenses and cannot be deleted', code: 'EXPENSE_CATEGORY_IN_USE', requestId: req.requestId });
    }

    await query('DELETE FROM expense_categories WHERE id = $1 AND location_id = $2', [req.params.id, locationId]);
    return res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    console.error('Delete expense category error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'EXPENSE_CATEGORY_DELETE_ERROR', requestId: req.requestId });
  }
});

router.get('/', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;
    const category = req.query.category;

    let queryText = `
      SELECT e.*, CONCAT('EXP-', LPAD(e.id::text, 6, '0')) as expense_code, u.username as created_by_name
      FROM expenses e
      JOIN users u ON e.created_by = u.id
      WHERE e.location_id = $1
    `;

    const params = [locationId];

    if (req.user.role === 'manager') {
      params.push(req.user.id);
      queryText += ` AND e.created_by = $${params.length}`;
    }

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
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'EXPENSE_FETCH_ERROR', requestId: req.requestId });
  }
});

router.post('/',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('category').trim().notEmpty(),
  body('amount').isFloat({ min: 0 }),
  body('expense_date').isDate(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    const { category, description, amount, expense_date } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'];

    try {
      const locationId = await getTargetLocationId(req, query);
      const { hasExpenseCategoriesTable } = await getExpenseSchemaSupport();
      if (req.user.role === 'manager' && !isCurrentDateValue(expense_date)) {
        return res.status(400).json({
          error: 'Managers can only record expenses for today.',
          code: 'EXPENSE_FUTURE_DATE_FORBIDDEN',
          requestId: req.requestId,
        });
      }

      if (hasExpenseCategoriesTable) {
        const categoryExists = await query(
          `SELECT id
           FROM expense_categories
           WHERE location_id = $1 AND LOWER(name) = LOWER($2)
             ${req.user.role === 'manager' ? 'AND created_by = $3' : ''}
           LIMIT 1`,
          req.user.role === 'manager' ? [locationId, category, req.user.id] : [locationId, category]
        );
        if (!categoryExists.rows.length) {
          return res.status(400).json({ error: 'Invalid expense category', code: 'INVALID_EXPENSE_CATEGORY', requestId: req.requestId });
        }
      }

      const expense = await withTransaction(async (tx) => {
        const effectiveActorId = await resolveEffectiveActor(tx, req, locationId);

        if (idempotencyKey) {
          const existing = await tx.query(
            `SELECT response_payload FROM idempotency_keys
             WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3`,
            [effectiveActorId, idempotencyKey, '/api/expenses']
          );

          if (existing.rows.length > 0) {
            return existing.rows[0].response_payload;
          }
        }

        const result = await tx.query(
          `INSERT INTO expenses (location_id, category, description, amount, expense_date, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [locationId, category, description || null, amount, expense_date, effectiveActorId]
        );

        await tx.query(
          `INSERT INTO kpi_events (location_id, user_id, event_type, event_value, metadata)
           VALUES ($1, $2, 'expense_created', $3, $4)`,
          [locationId, effectiveActorId, amount, JSON.stringify({ expense_id: result.rows[0].id, category, synced_by_user_id: req.user.id })]
        );

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [effectiveActorId, locationId, 'expense_created', `Created expense: ${category} - ${amount}`, JSON.stringify({ expense_id: result.rows[0].id, category, amount, synced_by_user_id: req.user.id })]
        );

        if (idempotencyKey) {
          await tx.query(
            `INSERT INTO idempotency_keys (user_id, location_id, idempotency_key, endpoint, response_payload)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, idempotency_key, endpoint) DO NOTHING`,
            [effectiveActorId, locationId, idempotencyKey, '/api/expenses', JSON.stringify(result.rows[0])]
          );
        }

        return result.rows[0];
      });

      try {
        await query(
          `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
           SELECT id, $1, 'Expense Added', $2, 'expense_created'
           FROM users
           WHERE role = 'admin' AND is_active = true AND (location_id = $1 OR location_id IS NULL)`,
          [locationId, `Expense ${category} was added for ETB ${Number(amount).toFixed(2)}.`]
        );
      } catch (notifyErr) {
        console.error('Expense post-commit notification failed:', notifyErr);
      }

      res.status(201).json(expense);
    } catch (err) {
      console.error('Create expense error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'EXPENSE_CREATE_ERROR', requestId: req.requestId });
    }
  }
);

router.put('/:id', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  const { category, description, amount, expense_date, reason } = req.body;

  try {
    const locationId = await getTargetLocationId(req, query);
    const updated = await withTransaction(async (tx) => {
      const existing = await tx.query(
        `SELECT *,
                (CURRENT_TIMESTAMP < (created_at + make_interval(mins => $2::int))) as can_edit,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 60 as age_minutes
         FROM expenses
         WHERE id = $1 AND location_id = $3
         FOR UPDATE`,
        [req.params.id, EXPENSE_EDIT_WINDOW_MINUTES, locationId]
      );

      if (!existing.rows.length) {
        const err = new Error('Expense not found');
        err.status = 404;
        throw err;
      }

      const expense = existing.rows[0];
      if (req.user.role === 'manager' && Number(expense.created_by) !== Number(req.user.id)) {
        const err = new Error('You can only edit your own expenses.');
        err.status = 403;
        err.code = 'EXPENSE_EDIT_FORBIDDEN';
        throw err;
      }
      if (!expense.can_edit) {
        const err = new Error(`Expenses can only be edited within ${EXPENSE_EDIT_WINDOW_MINUTES} minutes. This expense is ${Math.floor(Number(expense.age_minutes || 0))} minutes old.`);
        err.status = 403;
        err.code = 'EXPENSE_EDIT_WINDOW_EXPIRED';
        throw err;
      }
      if (req.user.role === 'manager' && expense_date && !isCurrentDateValue(expense_date)) {
        const err = new Error('Managers can only keep expenses on the current date.');
        err.status = 400;
        err.code = 'EXPENSE_FUTURE_DATE_FORBIDDEN';
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
        [req.user.id, expense.location_id, `Updated expense ${expense.id}`, JSON.stringify({ expense_id: expense.id, reason: reason || 'No reason provided' })]
      );

      return result.rows[0];
    });

    res.json(updated);
  } catch (err) {
    console.error('Update expense error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code || 'EXPENSE_UPDATE_ERROR', requestId: req.requestId });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    await withTransaction(async (tx) => {
      const existing = await tx.query(
        `SELECT *,
                (CURRENT_TIMESTAMP < (created_at + make_interval(mins => $2::int))) as can_edit,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 60 as age_minutes
         FROM expenses
         WHERE id = $1 AND location_id = $3
         FOR UPDATE`,
        [req.params.id, EXPENSE_EDIT_WINDOW_MINUTES, locationId]
      );

      if (!existing.rows.length) {
        const err = new Error('Expense not found');
        err.status = 404;
        throw err;
      }

      const expense = existing.rows[0];
      if (req.user.role === 'manager' && Number(expense.created_by) !== Number(req.user.id)) {
        const err = new Error('You can only delete your own expenses.');
        err.status = 403;
        err.code = 'EXPENSE_DELETE_FORBIDDEN';
        throw err;
      }
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
});

router.get('/summary/categories', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    let queryText = `
      SELECT e.category,
             SUM(amount) as total_amount,
             COUNT(*) as count
      FROM expenses e
      WHERE e.location_id = $1
    `;

    const params = [locationId];

    if (req.user.role === 'manager') {
      params.push(req.user.id);
      queryText += ` AND e.created_by = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      queryText += ` AND e.expense_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND e.expense_date <= $${params.length}`;
    }

    queryText += ' GROUP BY category ORDER BY total_amount DESC';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get expense summary error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'EXPENSE_SUMMARY_ERROR', requestId: req.requestId });
  }
});

export default router;
