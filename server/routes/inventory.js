import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();
const BATCH_EDIT_WINDOW_MINUTES = 20;

router.get('/', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);

    const result = await query(
      `SELECT i.*, p.name as product_name, p.price, p.cost, p.unit, c.name as category_name, u.username as last_updated_by_name
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN LATERAL (
         SELECT im.created_by
         FROM inventory_movements im
         WHERE im.location_id = i.location_id AND im.product_id = i.product_id
         ORDER BY im.created_at DESC
         LIMIT 1
       ) latest ON true
       LEFT JOIN users u ON u.id = latest.created_by
       WHERE i.location_id = $1
       ORDER BY c.name, p.name`,
      [locationId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get inventory error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});


router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('product_id').isInt({ min: 1 }),
  body('quantity').isInt({ min: 0 }),
  body('source').optional().isIn(['baked', 'purchased']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const locationId = await getTargetLocationId(req, query);
      const { product_id, quantity, source = 'baked' } = req.body;

      const result = await query(
        `INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (product_id, location_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, source = EXCLUDED.source, last_updated = CURRENT_TIMESTAMP
         RETURNING *`,
        [product_id, locationId, quantity, source]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create inventory row error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
    }
  }
);

router.put(
  '/:productId',
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

    try {
      const locationId = await getTargetLocationId(req, query);
      const result = await query(
        `INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (product_id, location_id)
         DO UPDATE SET quantity = $3, source = $4, last_updated = CURRENT_TIMESTAMP
         RETURNING *`,
        [productId, locationId, quantity, source]
      );

      await query(
        `INSERT INTO inventory_movements
         (location_id, product_id, movement_type, quantity_change, source, reference_type, created_by, metadata)
         VALUES ($1, $2, 'manual_adjustment', $3, $4, 'manual', $5, $6)`,
        [locationId, productId, quantity, source, req.user.id, JSON.stringify({ absolute_quantity: quantity })]
      );

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          req.user.id,
          locationId,
          'inventory_updated',
          `Updated inventory for product ${productId}`,
          JSON.stringify({ product_id: productId, quantity, source }),
        ]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update inventory error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
    }
  }
);


router.delete('/:id', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const target = await query(
      `SELECT * FROM inventory WHERE location_id = $1 AND (id = $2 OR product_id = $2) LIMIT 1`,
      [locationId, req.params.id]
    );

    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const item = target.rows[0];
    await query(`DELETE FROM inventory WHERE id = $1`, [item.id]);

    await query(
      `INSERT INTO inventory_movements
       (location_id, product_id, movement_type, quantity_change, source, reference_type, created_by, metadata)
       VALUES ($1, $2, 'manual_adjustment', $3, $4, 'manual', $5, $6)`,
      [locationId, item.product_id, -Number(item.quantity || 0), item.source || 'baked', req.user.id, JSON.stringify({ deleted_inventory_row: true })]
    );

    return res.json({ message: 'Inventory item deleted successfully', deleted: item });
  } catch (err) {
    console.error('Delete inventory error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post(
  '/batches',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('items').isArray({ min: 1 }),
  body('items.*.product_id').isInt({ min: 1 }),
  body('items.*.quantity').isInt({ min: 1 }),
  body('items.*.source').isIn(['baked', 'purchased']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, notes } = req.body;
    const retryCount = Number(req.headers['x-retry-count'] || 0);
    const idempotencyKey = req.headers['x-idempotency-key'];

    try {
      const locationId = await getTargetLocationId(req, query);
      const batch = await withTransaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.query(
            `SELECT response_payload FROM idempotency_keys
             WHERE user_id = $1 AND idempotency_key = $2`,
            [req.user.id, idempotencyKey]
          );
          if (existing.rows.length > 0) {
            return existing.rows[0].response_payload;
          }
        }

        const batchResult = await tx.query(
          `INSERT INTO inventory_batches (location_id, created_by, batch_date, status, notes)
           VALUES ($1, $2, CURRENT_DATE, 'sent', $3)
           RETURNING *`,
          [locationId, req.user.id, notes || null]
        );

        const createdBatch = batchResult.rows[0];

        for (const item of items) {
          await tx.query(
            `INSERT INTO batch_items (batch_id, product_id, quantity, source)
             VALUES ($1, $2, $3, $4)`,
            [createdBatch.id, item.product_id, item.quantity, item.source]
          );

          await tx.query(
            `INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             ON CONFLICT (product_id, location_id)
             DO UPDATE SET
               quantity = inventory.quantity + $3,
               source = $4,
               last_updated = CURRENT_TIMESTAMP`,
            [item.product_id, locationId, item.quantity, item.source]
          );

          await tx.query(
            `INSERT INTO inventory_movements
             (location_id, product_id, movement_type, quantity_change, source, reference_type, reference_id, created_by, metadata)
             VALUES ($1, $2, 'batch_in', $3, $4, 'batch', $5, $6, $7)`,
            [locationId, item.product_id, item.quantity, item.source, createdBatch.id, req.user.id, JSON.stringify({ notes: notes || null })]
          );
        }

        await tx.query(
          `INSERT INTO kpi_events (location_id, user_id, event_type, event_value, metric_key, metadata)
           VALUES ($1, $2, 'batch_sent', $3, $4, $5)`,
          [locationId, req.user.id, items.length, 'batch_retry_count', JSON.stringify({ batch_id: createdBatch.id, retry_count: retryCount })]
        );

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            req.user.id,
            locationId,
            'batch_sent',
            `Sent inventory batch #${createdBatch.id}`,
            JSON.stringify({ batch_id: createdBatch.id, items_count: items.length }),
          ]
        );

        if (idempotencyKey) {
          await tx.query(
            `INSERT INTO idempotency_keys (user_id, location_id, idempotency_key, endpoint, response_payload)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
            [req.user.id, locationId, idempotencyKey, '/api/inventory/batches', JSON.stringify(createdBatch)]
          );
        }

        return createdBatch;
      });

      res.status(201).json(batch);
    } catch (err) {
      console.error('Create batch error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
    }
  }
);

router.get('/batches', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const limit = parseInt(req.query.limit, 10) || 50;

    const result = await query(
      `SELECT b.*, u.username as created_by_name,
              (SELECT COUNT(*) FROM batch_items WHERE batch_id = b.id) as items_count,
              COALESCE((SELECT SUM(bi.quantity * COALESCE(p.cost, 0))
                        FROM batch_items bi
                        JOIN products p ON p.id = bi.product_id
                        WHERE bi.batch_id = b.id), 0) as total_cost,
              (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b.created_at)) / 60) <= $3 as can_edit
       FROM inventory_batches b
       JOIN users u ON b.created_by = u.id
       WHERE b.location_id = $1
       ORDER BY b.created_at DESC
       LIMIT $2`,
      [locationId, limit, BATCH_EDIT_WINDOW_MINUTES]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get batches error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/batches/:id', authenticateToken, async (req, res) => {
  try {
    const batchResult = await query(
      `SELECT b.*, u.username as created_by_name,
              (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b.created_at)) / 60) <= $2 as can_edit
       FROM inventory_batches b
       JOIN users u ON b.created_by = u.id
       WHERE b.id = $1`,
      [req.params.id, BATCH_EDIT_WINDOW_MINUTES]
    );

    if (batchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const itemsResult = await query(
      `SELECT bi.*, p.name as product_name, p.unit, COALESCE(p.cost, 0) as unit_cost, (bi.quantity * COALESCE(p.cost, 0)) as line_cost
       FROM batch_items bi
       JOIN products p ON bi.product_id = p.id
       WHERE bi.batch_id = $1`,
      [req.params.id]
    );

    const batch = batchResult.rows[0];
    batch.items = itemsResult.rows;
    batch.total_cost = itemsResult.rows.reduce((sum, item) => sum + Number(item.line_cost || 0), 0);

    res.json(batch);
  } catch (err) {
    console.error('Get batch details error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.put('/batches/:id', authenticateToken, authorizeRoles('admin', 'manager'), body('items').isArray({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const locationId = await getTargetLocationId(req, query);
    const { items, notes } = req.body;

    const updatedBatch = await withTransaction(async (tx) => {
      const batchRes = await tx.query(`SELECT * FROM inventory_batches WHERE id = $1 AND location_id = $2 FOR UPDATE`, [req.params.id, locationId]);
      if (!batchRes.rows.length) {
        const err = new Error('Batch not found');
        err.status = 404;
        throw err;
      }

      const batch = batchRes.rows[0];
      const ageMinutes = (Date.now() - new Date(batch.created_at).getTime()) / 60000;
      if (ageMinutes > BATCH_EDIT_WINDOW_MINUTES) {
        const err = new Error('Batch edit window has expired');
        err.status = 400;
        throw err;
      }

      const oldItemsRes = await tx.query('SELECT * FROM batch_items WHERE batch_id = $1', [req.params.id]);
      for (const item of oldItemsRes.rows) {
        await tx.query(`UPDATE inventory SET quantity = GREATEST(0, quantity - $1), last_updated = CURRENT_TIMESTAMP WHERE location_id = $2 AND product_id = $3`, [item.quantity, locationId, item.product_id]);
      }

      await tx.query('DELETE FROM batch_items WHERE batch_id = $1', [req.params.id]);

      for (const item of items) {
        await tx.query(`INSERT INTO batch_items (batch_id, product_id, quantity, source) VALUES ($1, $2, $3, $4)`, [req.params.id, item.product_id, item.quantity, item.source]);
        await tx.query(`INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)
                        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                        ON CONFLICT (product_id, location_id)
                        DO UPDATE SET quantity = inventory.quantity + $3, source = $4, last_updated = CURRENT_TIMESTAMP`,
          [item.product_id, locationId, item.quantity, item.source]);
      }

      const updated = await tx.query(`UPDATE inventory_batches SET status = 'edited', notes = COALESCE($1, notes) WHERE id = $2 RETURNING *`, [notes || null, req.params.id]);
      return updated.rows[0];
    });

    return res.json(updatedBatch);
  } catch (err) {
    console.error('Edit batch error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/batches/:id/void', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);

    const voided = await withTransaction(async (tx) => {
      const batchRes = await tx.query(`SELECT * FROM inventory_batches WHERE id = $1 AND location_id = $2 FOR UPDATE`, [req.params.id, locationId]);
      if (!batchRes.rows.length) {
        const err = new Error('Batch not found');
        err.status = 404;
        throw err;
      }
      const batch = batchRes.rows[0];
      const ageMinutes = (Date.now() - new Date(batch.created_at).getTime()) / 60000;
      if (ageMinutes > BATCH_EDIT_WINDOW_MINUTES) {
        const err = new Error('Batch void window has expired');
        err.status = 400;
        throw err;
      }
      if (batch.status === 'voided') {
        return batch;
      }

      const itemsRes = await tx.query('SELECT * FROM batch_items WHERE batch_id = $1', [req.params.id]);
      for (const item of itemsRes.rows) {
        await tx.query(`UPDATE inventory SET quantity = GREATEST(0, quantity - $1), last_updated = CURRENT_TIMESTAMP WHERE location_id = $2 AND product_id = $3`, [item.quantity, locationId, item.product_id]);
      }

      const updated = await tx.query(`UPDATE inventory_batches SET status = 'voided' WHERE id = $1 RETURNING *`, [req.params.id]);
      return updated.rows[0];
    });

    return res.json(voided);
  } catch (err) {
    console.error('Void batch error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
