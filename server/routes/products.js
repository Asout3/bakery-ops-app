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
          `SELECT p.*, c.name as category_name,
                  CASE WHEN p.is_active = false THEN 'inactive'
                       WHEN EXISTS (SELECT 1 FROM inventory i WHERE i.product_id = p.id AND i.quantity > 0) THEN 'active'
                       ELSE 'out_of_stock'
                  END AS availability_status
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           ORDER BY c.name, p.name`
        )
      : await query(
          `SELECT DISTINCT p.*, c.name as category_name,
                  CASE WHEN p.is_active = false THEN 'inactive'
                       WHEN EXISTS (SELECT 1 FROM inventory i2 WHERE i2.product_id = p.id AND i2.location_id = $1 AND i2.quantity > 0) THEN 'active'
                       ELSE 'out_of_stock'
                  END AS availability_status
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           LEFT JOIN inventory i ON i.product_id = p.id AND i.location_id = $1
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
  body('source').optional().isIn(['baked', 'purchased']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, category_id, price, cost, unit, source } = req.body;

    try {
      const existing = await query('SELECT id FROM products WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Product name already exists', code: 'DUPLICATE_PRODUCT_NAME', requestId: req.requestId });
      }

      const result = await query(
        `INSERT INTO products (name, category_id, price, cost, unit, source) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [name, category_id || null, price, cost || null, unit || 'piece', source || 'baked']
      );

      // Log activity
      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description) 
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, req.user.location_id, 'product_created', `Created product: ${name}`]
      );


      const admins = await query(
        `SELECT id FROM users WHERE role = 'admin' AND is_active = true`
      );
      await Promise.all(admins.rows.map((admin) => query(
        `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [admin.id, req.user.location_id || null, 'New product needs inventory setup', `Product "${name}" was created by ${req.user.username || `user ${req.user.id}`}. Add it to inventory to make it available for operations.`, 'inventory_setup']
      )));

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
    const { name, category_id, price, cost, unit, is_active, source } = req.body;
    const { id } = req.params;

    try {
      if (name) {
        const duplicate = await query('SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND id <> $2 LIMIT 1', [name, id]);
        if (duplicate.rows.length > 0) {
          return res.status(409).json({ error: 'Product name already exists', code: 'DUPLICATE_PRODUCT_NAME', requestId: req.requestId });
        }
      }

      const result = await query(
        `UPDATE products 
         SET name = COALESCE($1, name),
             category_id = COALESCE($2, category_id),
             price = COALESCE($3, price),
             cost = COALESCE($4, cost),
             unit = COALESCE($5, unit),
             is_active = COALESCE($6, is_active),
             source = COALESCE($7, source),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $8
         RETURNING *`,
        [name, category_id, price, cost, unit, is_active, source, id]
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
  authorizeRoles('admin', 'manager'),
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
