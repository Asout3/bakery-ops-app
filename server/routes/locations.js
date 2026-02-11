import express from 'express';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, address, phone, is_active, created_at
       FROM locations
       WHERE is_active = true
       ORDER BY name ASC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get locations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/', authenticateToken, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { name, address, phone } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Location name is required' });
  }

  try {
    const result = await query(
      `INSERT INTO locations (name, address, phone)
       VALUES ($1, $2, $3)
       RETURNING id, name, address, phone, is_active, created_at`,
      [name.trim(), address?.trim() || null, phone?.trim() || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create location error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
