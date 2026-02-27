import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();
const BATCH_EDIT_WINDOW_MINUTES = 20;

async function getInventoryBatchColumns(db) {
  const result = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'inventory_batches'`
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  return {
    hasOfflineFlag: columns.has('is_offline'),
    hasOriginalActorId: columns.has('original_actor_id'),
    hasOriginalActorName: columns.has('original_actor_name'),
    hasSyncedById: columns.has('synced_by_id'),
    hasSyncedByName: columns.has('synced_by_name'),
    hasSyncedAt: columns.has('synced_at'),
  };
}

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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const locationId = await getTargetLocationId(req, query);
      const { product_id, quantity } = req.body;
      const productRes = await query('SELECT source FROM products WHERE id = $1', [product_id]);
      if (!productRes.rows.length) {
        return res.status(404).json({ error: 'Product not found', code: 'PRODUCT_NOT_FOUND', requestId: req.requestId });
      }
      const source = productRes.rows[0].source || 'baked';

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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId } = req.params;
    const { quantity } = req.body;

    try {
      const locationId = await getTargetLocationId(req, query);
      const productRes = await query('SELECT source FROM products WHERE id = $1', [productId]);
      if (!productRes.rows.length) {
        return res.status(404).json({ error: 'Product not found', code: 'PRODUCT_NOT_FOUND', requestId: req.requestId });
      }
      const source = productRes.rows[0].source || 'baked';
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, notes } = req.body;
    const retryCount = Number(req.headers['x-retry-count'] || 0);
    const idempotencyKey = req.headers['x-idempotency-key'];
    const isFromOfflineQueue = req.headers['x-queued-request'] === 'true';
    const queuedCreatedAtHeader = req.headers['x-queued-created-at'];
    const queuedActorIdHeader = req.headers['x-offline-actor-id'];

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

        const queuedCreatedAt = queuedCreatedAtHeader ? new Date(queuedCreatedAtHeader) : null;
        const hasValidQueuedCreatedAt = queuedCreatedAt instanceof Date && !Number.isNaN(queuedCreatedAt.getTime()) && queuedCreatedAt.getTime() <= Date.now();
        const effectiveCreatedAt = hasValidQueuedCreatedAt ? queuedCreatedAt.toISOString() : new Date().toISOString();

        const batchColumns = await getInventoryBatchColumns(tx);

        let effectiveCreatedBy = req.user.id;
        let originalActorName = req.user.username;

        if (isFromOfflineQueue && queuedActorIdHeader) {
          const actorResult = await tx.query(
            `SELECT id, username FROM users WHERE id = $1 AND location_id = $2`,
            [queuedActorIdHeader, locationId]
          );
          if (actorResult.rows.length > 0) {
            effectiveCreatedBy = Number(actorResult.rows[0].id);
            originalActorName = actorResult.rows[0].username;
          }
        }

        const insertColumns = ['location_id', 'created_by', 'batch_date', 'status', 'notes', 'created_at'];
        const insertValues = ['$1', '$2', '$3::date', "'sent'", '$4', '$3::timestamp'];
        const params = [locationId, effectiveCreatedBy, effectiveCreatedAt, notes || null];

        if (batchColumns.hasOfflineFlag) {
          insertColumns.push('is_offline');
          insertValues.push(`$${params.length + 1}`);
          params.push(isFromOfflineQueue);
        }

        if (batchColumns.hasOriginalActorId) {
          insertColumns.push('original_actor_id');
          insertValues.push(`$${params.length + 1}`);
          params.push(effectiveCreatedBy);
        }

        if (batchColumns.hasOriginalActorName) {
          insertColumns.push('original_actor_name');
          insertValues.push(`$${params.length + 1}`);
          params.push(originalActorName);
        }

        if (batchColumns.hasSyncedById) {
          insertColumns.push('synced_by_id');
          insertValues.push(`$${params.length + 1}`);
          params.push(isFromOfflineQueue ? req.user.id : null);
        }

        if (batchColumns.hasSyncedByName) {
          insertColumns.push('synced_by_name');
          insertValues.push(`$${params.length + 1}`);
          params.push(isFromOfflineQueue ? req.user.username : null);
        }

        if (batchColumns.hasSyncedAt) {
          insertColumns.push('synced_at');
          insertValues.push(`$${params.length + 1}`);
          params.push(isFromOfflineQueue ? new Date().toISOString() : null);
        }

        const batchResult = await tx.query(
          `INSERT INTO inventory_batches (${insertColumns.join(', ')})
           VALUES (${insertValues.join(', ')})
           RETURNING *`,
          params
        );

        const createdBatch = batchResult.rows[0];

        for (const item of items) {
          const productSourceRes = await tx.query('SELECT source FROM products WHERE id = $1', [item.product_id]);
          if (!productSourceRes.rows.length) {
            const sourceErr = new Error(`Product ${item.product_id} not found`);
            sourceErr.status = 404;
            throw sourceErr;
          }
          const itemSource = productSourceRes.rows[0].source || 'baked';
          if (item.source && item.source !== itemSource) {
            const sourceErr = new Error(`Product ${item.product_id} must be batched as ${itemSource}`);
            sourceErr.status = 400;
            throw sourceErr;
          }

          await tx.query(
            `INSERT INTO batch_items (batch_id, product_id, quantity, source)
             VALUES ($1, $2, $3, $4)`,
            [createdBatch.id, item.product_id, item.quantity, itemSource]
          );

          await tx.query(
            `INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             ON CONFLICT (product_id, location_id)
             DO UPDATE SET
               quantity = inventory.quantity + $3,
               source = $4,
               last_updated = CURRENT_TIMESTAMP`,
            [item.product_id, locationId, item.quantity, itemSource]
          );

          await tx.query(
            `INSERT INTO inventory_movements
             (location_id, product_id, movement_type, quantity_change, source, reference_type, reference_id, created_by, metadata)
             VALUES ($1, $2, 'batch_in', $3, $4, 'batch', $5, $6, $7)`,
            [locationId, item.product_id, item.quantity, itemSource, createdBatch.id, effectiveCreatedBy, JSON.stringify({ notes: notes || null, synced_by_user_id: req.user.id })]
          );
        }

        await tx.query(
          `INSERT INTO kpi_events (location_id, user_id, event_type, event_value, metric_key, metadata)
           VALUES ($1, $2, 'batch_sent', $3, $4, $5)`,
          [locationId, effectiveCreatedBy, items.length, 'batch_retry_count', JSON.stringify({ batch_id: createdBatch.id, retry_count: retryCount, synced_by_user_id: req.user.id })]
        );

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            effectiveCreatedBy,
            locationId,
            'batch_sent',
            `Sent inventory batch #${createdBatch.id}`,
            JSON.stringify({ batch_id: createdBatch.id, items_count: items.length }),
          ]
        );

        const batchValueResult = await tx.query(
          `SELECT COALESCE(SUM(bi.quantity * COALESCE(p.cost, 0)), 0) as total_value
           FROM batch_items bi
           JOIN products p ON p.id = bi.product_id
           WHERE bi.batch_id = $1`,
          [createdBatch.id]
        );
        const totalBatchValue = Number(batchValueResult.rows[0]?.total_value || 0);

        await tx.query(
          `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
           SELECT id, $1, $2, $3, 'batch'
           FROM users 
           WHERE role IN ('admin', 'manager') 
           AND location_id = $1
           AND is_active = true`,
          [
            locationId,
            `📦 New Batch Sent #${createdBatch.id}`,
            `${originalActorName} sent a batch with ${items.length} items (Total: ETB ${totalBatchValue.toFixed(2)})${isFromOfflineQueue ? ' [Synced from Offline]' : ''}`
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
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;
    const batchColumns = await getInventoryBatchColumns({ query });

    const displayCreatorExpr = batchColumns.hasOriginalActorName
      ? 'COALESCE(b.original_actor_name, u.username)'
      : 'u.username';
    const syncedByNameExpr = batchColumns.hasSyncedByName ? 'b.synced_by_name' : 'NULL';
    const wasSyncedExpr = batchColumns.hasSyncedById ? '(b.synced_by_id IS NOT NULL)' : 'false';
    const isOfflineExpr = batchColumns.hasOfflineFlag
      ? (batchColumns.hasSyncedById ? '(COALESCE(b.is_offline, false) OR b.synced_by_id IS NOT NULL)' : 'COALESCE(b.is_offline, false)')
      : (batchColumns.hasSyncedById ? '(b.synced_by_id IS NOT NULL)' : 'false');

    let queryText = `SELECT b.*, u.username as created_by_name,
              ${displayCreatorExpr} as display_creator_name,
              ${syncedByNameExpr} as synced_by_name,
              ${wasSyncedExpr} as was_synced,
              ${isOfflineExpr} as is_offline,
              (SELECT COUNT(*) FROM batch_items WHERE batch_id = b.id) as items_count,
              COALESCE((SELECT SUM(bi.quantity * COALESCE(p.cost, 0))
                        FROM batch_items bi
                        JOIN products p ON p.id = bi.product_id
                        WHERE bi.batch_id = b.id), 0) as total_cost,
              (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b.created_at)) / 60) <= $2 as can_edit,
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b.created_at)) / 60 as age_minutes
       FROM inventory_batches b
       JOIN users u ON b.created_by = u.id
       WHERE b.location_id = $1`;

    const params = [locationId, BATCH_EDIT_WINDOW_MINUTES];

    if (startDate) {
      params.push(startDate);
      queryText += ` AND DATE(b.created_at) >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND DATE(b.created_at) <= $${params.length}`;
    }

    queryText += ` ORDER BY b.created_at DESC, b.id DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryText, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Get batches error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/batches/:id', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const batchColumns = await getInventoryBatchColumns({ query });
    const displayCreatorExpr = batchColumns.hasOriginalActorName
      ? 'COALESCE(b.original_actor_name, u.username)'
      : 'u.username';
    const syncedByNameExpr = batchColumns.hasSyncedByName ? 'b.synced_by_name' : 'NULL';
    const wasSyncedExpr = batchColumns.hasSyncedById ? '(b.synced_by_id IS NOT NULL)' : 'false';
    const isOfflineExpr = batchColumns.hasOfflineFlag
      ? (batchColumns.hasSyncedById ? '(COALESCE(b.is_offline, false) OR b.synced_by_id IS NOT NULL)' : 'COALESCE(b.is_offline, false)')
      : (batchColumns.hasSyncedById ? '(b.synced_by_id IS NOT NULL)' : 'false');

    const batchResult = await query(
      `SELECT b.*, u.username as created_by_name,
              ${displayCreatorExpr} as display_creator_name,
              ${syncedByNameExpr} as synced_by_name,
              ${wasSyncedExpr} as was_synced,
              ${isOfflineExpr} as is_offline,
              (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b.created_at)) / 60) <= $3 as can_edit,
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b.created_at)) / 60 as age_minutes
       FROM inventory_batches b
       JOIN users u ON b.created_by = u.id
       WHERE b.id = $1 AND b.location_id = $2`,
      [req.params.id, locationId, BATCH_EDIT_WINDOW_MINUTES]
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
        const productSourceRes = await tx.query('SELECT source FROM products WHERE id = $1', [item.product_id]);
        if (!productSourceRes.rows.length) {
          const err = new Error(`Product ${item.product_id} not found`);
          err.status = 404;
          throw err;
        }
        const itemSource = productSourceRes.rows[0].source || 'baked';
        if (item.source && item.source !== itemSource) {
          const err = new Error(`Product ${item.product_id} must be batched as ${itemSource}`);
          err.status = 400;
          throw err;
        }

        await tx.query(`INSERT INTO batch_items (batch_id, product_id, quantity, source) VALUES ($1, $2, $3, $4)`, [req.params.id, item.product_id, item.quantity, itemSource]);
        await tx.query(`INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)
                        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                        ON CONFLICT (product_id, location_id)
                        DO UPDATE SET quantity = inventory.quantity + $3, source = $4, last_updated = CURRENT_TIMESTAMP`,
          [item.product_id, locationId, item.quantity, itemSource]);
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
