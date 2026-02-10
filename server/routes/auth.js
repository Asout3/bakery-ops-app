import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Register new user
router.post('/register',
  body('username').trim().isLength({ min: 3 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['admin', 'manager', 'cashier']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, role, location_id } = req.body;

    try {
      // Check if user exists
      const userCheck = await query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (userCheck.rows.length > 0) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10);

      // Insert user
      const result = await query(
        `INSERT INTO users (username, email, password_hash, role, location_id) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, role, location_id`,
        [username, email, password_hash, role, location_id || null]
      );

      const user = result.rows[0];

      // Generate token
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, location_id: user.location_id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({ user, token });
    } catch (err) {
      console.error('Registration error:', err);
      if (err.code === 'ECONNREFUSED') {
        return res.status(503).json({
          error: 'Database is not reachable. Start PostgreSQL or set DATABASE_URL correctly.',
        });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Login
router.post('/login',
  body('username').trim().escape(),
  body('password').exists(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
      const result = await query(
        'SELECT * FROM users WHERE username = $1 AND is_active = true',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate token
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, location_id: user.location_id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Remove password hash from response
      delete user.password_hash;

      res.json({ user, token });
    } catch (err) {
      console.error('Login error:', err);
      if (err.code === 'ECONNREFUSED') {
        return res.status(503).json({
          error: 'Database is not reachable. Start PostgreSQL or set DATABASE_URL correctly.',
        });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, email, role, location_id, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get user error:', err);
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Database is not reachable. Start PostgreSQL or set DATABASE_URL correctly.',
      });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
