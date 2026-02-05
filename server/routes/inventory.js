import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Get inventory for location
router.get('/', authenticateToken, async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
    
    const result = await query(
      `SELECT i.*, p.name as product_name, p.price, p.unit, c.name as category_name
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE i.location_id = $1
       ORDER BY c.name, p.name`,
      [locationId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get inventory error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update inventory quantity (manager)
router.put('/:productId',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('quantity').isInt({ min: 0 }),
  body('source').isIn(['baked', 'purchased']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId } = req.params;
    const { quantity, source } = req.body;
    const locationId = req.user.location_id;

    try {
      const result = await query(
        `INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (product_id, location_id)
         DO UPDATE SET quantity = $3, source = $4, last_updated = CURRENT_TIMESTAMP
         RETURNING *`,
        [productId, locationId, quantity, source]
      );

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          req.user.id,
          locationId,
          'inventory_updated',
          `Updated inventory for product ${productId}`,
          JSON.stringify({ product_id: productId, quantity, source })
        ]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update inventory error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Create inventory batch (manager sends batch)
router.post('/batches',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('items').isArray({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, notes } = req.body;
    const locationId = req.user.location_id;

    const client = await query('BEGIN');

    try {
      // Create batch
      const batchResult = await query(
        `INSERT INTO inventory_batches (location_id, created_by, batch_date, status, notes)
         VALUES ($1, $2, CURRENT_DATE, 'sent', $3)
         RETURNING *`,
        [locationId, req.user.id, notes || null]
      );

      const batch = batchResult.rows[0];

      // Insert batch items and update inventory
      for (const item of items) {
        await query(
          `INSERT INTO batch_items (batch_id, product_id, quantity, source)
           VALUES ($1, $2, $3, $4)`,
          [batch.id, item.product_id, item.quantity, item.source]
        );

        // Update inventory
        await query(
          `INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (product_id, location_id)
           DO UPDATE SET 
             quantity = inventory.quantity + $3,
             last_updated = CURRENT_TIMESTAMP`,
          [item.product_id, locationId, item.quantity, item.source]
        );
      }

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          req.user.id,
          locationId,
          'batch_sent',
          `Sent inventory batch #${batch.id}`,
          JSON.stringify({ batch_id: batch.id, items_count: items.length })
        ]
      );

      await query('COMMIT');

      res.status(201).json(batch);
    } catch (err) {
      await query('ROLLBACK');
      console.error('Create batch error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get batches history
router.get('/batches', authenticateToken, async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
    const limit = parseInt(req.query.limit) || 50;

    const result = await query(
      `SELECT b.*, u.username as created_by_name,
              (SELECT COUNT(*) FROM batch_items WHERE batch_id = b.id) as items_count
       FROM inventory_batches b
       JOIN users u ON b.created_by = u.id
       WHERE b.location_id = $1
       ORDER BY b.created_at DESC
       LIMIT $2`,
      [locationId, limit]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get batches error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get batch details with items
router.get('/batches/:id', authenticateToken, async (req, res) => {
  try {
    const batchResult = await query(
      `SELECT b.*, u.username as created_by_name
       FROM inventory_batches b
       JOIN users u ON b.created_by = u.id
       WHERE b.id = $1`,
      [req.params.id]
    );

    if (batchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const itemsResult = await query(
      `SELECT bi.*, p.name as product_name, p.unit
       FROM batch_items bi
       JOIN products p ON bi.product_id = p.id
       WHERE bi.batch_id = $1`,
      [req.params.id]
    );

    const batch = batchResult.rows[0];
    batch.items = itemsResult.rows;

    res.json(batch);
  } catch (err) {
    console.error('Get batch details error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
