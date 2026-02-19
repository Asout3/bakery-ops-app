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

router.put('/:id', authenticateToken, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const id = Number(req.params.id);
  const { name, address, phone, is_active } = req.body;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid location id' });
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Location name is required' });
  }

  try {
    const result = await query(
      `UPDATE locations
       SET name = $1, address = $2, phone = $3, is_active = COALESCE($4, is_active)
       WHERE id = $5
       RETURNING id, name, address, phone, is_active, created_at`,
      [name.trim(), address?.trim() || null, phone?.trim() || null, typeof is_active === 'boolean' ? is_active : null, id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update location error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid location id' });

  try {
    const inUse = await query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE location_id = $1)::int AS users_count,
         (SELECT COUNT(*) FROM sales WHERE location_id = $1)::int AS sales_count,
         (SELECT COUNT(*) FROM expenses WHERE location_id = $1)::int AS expenses_count`,
      [id]
    );
    const usage = inUse.rows[0] || { users_count: 0, sales_count: 0, expenses_count: 0 };
    const totalUsage = Number(usage.users_count) + Number(usage.sales_count) + Number(usage.expenses_count);

    if (totalUsage > 0) {
      const deactivated = await query(
        `UPDATE locations SET is_active = false WHERE id = $1 RETURNING id, name, is_active`,
        [id]
      );
      if (!deactivated.rows.length) return res.status(404).json({ error: 'Branch not found' });
      return res.json({
        soft_deleted: true,
        message: 'Branch has related records and was disabled instead of deleted.',
        branch: deactivated.rows[0],
      });
    }

    const deleted = await query('DELETE FROM locations WHERE id = $1 RETURNING id, name', [id]);
    if (!deleted.rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json({ deleted: true, branch: deleted.rows[0] });
  } catch (err) {
    console.error('Delete location error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
