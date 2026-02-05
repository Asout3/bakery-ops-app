import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Get expenses
router.get('/', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
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
    res.status(500).json({ error: 'Internal server error' });
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
    const locationId = req.user.location_id;

    try {
      const result = await query(
        `INSERT INTO expenses (location_id, category, description, amount, expense_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [locationId, category, description || null, amount, expense_date, req.user.id]
      );

      await query(
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

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create expense error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update expense
router.put('/:id',
  authenticateToken,
  authorizeRoles('admin'),
  async (req, res) => {
    const { category, description, amount, expense_date } = req.body;

    try {
      const result = await query(
        `UPDATE expenses
         SET category = COALESCE($1, category),
             description = COALESCE($2, description),
             amount = COALESCE($3, amount),
             expense_date = COALESCE($4, expense_date)
         WHERE id = $5
         RETURNING *`,
        [category, description, amount, expense_date, req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update expense error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete expense
router.delete('/:id',
  authenticateToken,
  authorizeRoles('admin'),
  async (req, res) => {
    try {
      const result = await query(
        'DELETE FROM expenses WHERE id = $1 RETURNING *',
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }

      res.json({ message: 'Expense deleted successfully' });
    } catch (err) {
      console.error('Delete expense error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get expense categories summary
router.get('/summary/categories', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
