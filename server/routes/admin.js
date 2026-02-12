import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

router.get('/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email, u.role, u.location_id, u.is_active, u.created_at,
              l.name AS location_name
       FROM users u
       LEFT JOIN locations l ON l.id = u.location_id
       ORDER BY u.created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get admin users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/users',
  authenticateToken,
  authorizeRoles('admin'),
  body('username').trim().isLength({ min: 3 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone_number').optional().trim().isLength({ min: 8 }),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['manager', 'cashier']),
  body('location_id').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, phone_number, password, role, location_id } = req.body;

    try {
      const resolvedEmail = email || (phone_number ? `${phone_number.replace(/[^0-9+]/g, '') || 'user'}@phone.local` : null);
      if (!resolvedEmail) {
        return res.status(400).json({ error: 'Email or phone number is required' });
      }

      const exists = await query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, resolvedEmail]
      );

      if (exists.rows.length > 0) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }

      const locationExists = await query(
        'SELECT id FROM locations WHERE id = $1 AND is_active = true',
        [location_id]
      );

      if (locationExists.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid location' });
      }

      const password_hash = await bcrypt.hash(password, 10);

      const inserted = await query(
        `INSERT INTO users (username, email, password_hash, role, location_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, role, location_id, is_active, created_at`,
        [username, resolvedEmail, password_hash, role, location_id]
      );

      await query(
        `INSERT INTO user_locations (user_id, location_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [inserted.rows[0].id, location_id]
      );

      res.status(201).json(inserted.rows[0]);
    } catch (err) {
      console.error('Create admin user error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.patch('/users/:id/status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { is_active } = req.body;

    if (!Number.isInteger(id) || typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const updated = await query(
      `UPDATE users
       SET is_active = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND role IN ('manager', 'cashier')
       RETURNING id, username, email, role, location_id, is_active, created_at`,
      [is_active, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
