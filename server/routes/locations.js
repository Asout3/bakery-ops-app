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

export default router;
