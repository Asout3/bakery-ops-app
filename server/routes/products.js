import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();

// Get all products
router.get('/', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const role = req.user?.role;

    const result = role === 'admin'
      ? await query(
          `SELECT p.*, c.name as category_name
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           WHERE p.is_active = true
           ORDER BY c.name, p.name`
        )
      : await query(
          `SELECT DISTINCT p.*, c.name as category_name
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           JOIN inventory i ON i.product_id = p.id AND i.location_id = $1
           WHERE p.is_active = true
           ORDER BY c.name, p.name`,
          [locationId]
        );

    res.json(result.rows);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// Get single product
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, c.name as category_name 
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create product (admin/manager only)
router.post('/',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('name').trim().notEmpty(),
  body('price').isFloat({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, category_id, price, cost, unit } = req.body;

    try {
      const result = await query(
        `INSERT INTO products (name, category_id, price, cost, unit) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [name, category_id || null, price, cost || null, unit || 'piece']
      );

      // Log activity
      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description) 
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, req.user.location_id, 'product_created', `Created product: ${name}`]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create product error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update product
router.put('/:id',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  async (req, res) => {
    const { name, category_id, price, cost, unit, is_active } = req.body;
    const { id } = req.params;

    try {
      const result = await query(
        `UPDATE products 
         SET name = COALESCE($1, name),
             category_id = COALESCE($2, category_id),
             price = COALESCE($3, price),
             cost = COALESCE($4, cost),
             unit = COALESCE($5, unit),
             is_active = COALESCE($6, is_active),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING *`,
        [name, category_id, price, cost, unit, is_active, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description) 
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, req.user.location_id, 'product_updated', `Updated product: ${name || id}`]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update product error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete product (soft delete)
router.delete('/:id',
  authenticateToken,
  authorizeRoles('admin'),
  async (req, res) => {
    try {
      const result = await query(
        'UPDATE products SET is_active = false WHERE id = $1 RETURNING *',
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description) 
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, req.user.location_id, 'product_deleted', `Deleted product ID: ${req.params.id}`]
      );

      res.json({ message: 'Product deleted successfully' });
    } catch (err) {
      console.error('Delete product error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
