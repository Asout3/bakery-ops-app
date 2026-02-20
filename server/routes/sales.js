import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();

router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'cashier', 'manager'),
  body('items').isArray({ min: 1 }),
  body('items.*.product_id').isInt({ min: 1 }),
  body('items.*.quantity').isInt({ min: 1 }),
  body('payment_method').optional().isIn(['cash', 'card', 'mobile']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, payment_method, cashier_timing_ms } = req.body;
    const cashierId = req.user.id;
    const idempotencyKey = req.headers['x-idempotency-key'];
    const isOfflineQueued = req.headers['x-queued-request'] === 'true' || 
                           req.headers['x-retry-count'] !== undefined;

    try {
      const locationId = await getTargetLocationId(req, query);
      const sale = await withTransaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.query(
            `SELECT response_payload FROM idempotency_keys
             WHERE user_id = $1 AND idempotency_key = $2`,
            [cashierId, idempotencyKey]
          );
          if (existing.rows.length > 0) {
            return existing.rows[0].response_payload;
          }
        }

        let totalAmount = 0;
        const saleItems = [];

        for (const item of items) {
          const productResult = await tx.query('SELECT id, name, price FROM products WHERE id = $1', [item.product_id]);
          if (productResult.rows.length === 0) {
            const err = new Error(`Product ${item.product_id} not found`);
            err.status = 404;
            throw err;
          }

          const product = productResult.rows[0];
          const unitPrice = Number(product.price);
          const subtotal = unitPrice * item.quantity;
          totalAmount += subtotal;

          saleItems.push({
            product_id: item.product_id,
            product_name: product.name,
            quantity: item.quantity,
            unit_price: unitPrice,
            subtotal,
          });
        }

        const receiptNumber = `RCP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const saleResult = await tx.query(
          `INSERT INTO sales (location_id, cashier_id, total_amount, payment_method, receipt_number, is_offline)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [locationId, cashierId, totalAmount, payment_method || 'cash', receiptNumber, isOfflineQueued]
        );

        const createdSale = saleResult.rows[0];

        const lowStockRule = await tx.query(
          `SELECT threshold FROM alert_rules
           WHERE location_id = $1 AND event_type = 'low_stock' AND enabled = true
           ORDER BY updated_at DESC LIMIT 1`,
          [locationId]
        );
        const lowStockThreshold = Number(lowStockRule.rows[0]?.threshold || 5);

        for (const item of saleItems) {
          await tx.query(
            `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [createdSale.id, item.product_id, item.quantity, item.unit_price, item.subtotal]
          );

          const inventoryUpdateResult = await tx.query(
            `UPDATE inventory
             SET quantity = quantity - $1, last_updated = CURRENT_TIMESTAMP
             WHERE product_id = $2 AND location_id = $3 AND quantity >= $1
             RETURNING quantity`,
            [item.quantity, item.product_id, locationId]
          );

          if (inventoryUpdateResult.rowCount === 0) {
            const stockError = new Error(`Insufficient stock for ${item.product_name}`);
            stockError.status = 400;
            throw stockError;
          }

          const remainingQty = Number(inventoryUpdateResult.rows[0].quantity);

          await tx.query(
            `INSERT INTO inventory_movements
             (location_id, product_id, movement_type, quantity_change, source, reference_type, reference_id, created_by, metadata)
             VALUES ($1, $2, 'sale_out', $3, 'sale', 'sale', $4, $5, $6)`,
            [locationId, item.product_id, -item.quantity, createdSale.id, cashierId, JSON.stringify({ remaining_quantity: remainingQty })]
          );

          if (remainingQty < lowStockThreshold) {
            await tx.query(
              `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
               SELECT id, $1, $2, $3, $4 FROM users WHERE role IN ('admin', 'manager') AND location_id = $1`,
              [
                locationId,
                'Low Stock Alert',
                `${item.product_name} is running low (${remainingQty} remaining)`,
                'low_stock',
              ]
            );
          }
        }

        await tx.query(
          `INSERT INTO kpi_events (location_id, user_id, event_type, event_value, metric_key, duration_ms, metadata)
           VALUES ($1, $2, 'sale_created', $3, $4, $5, $6)`,
          [
            locationId,
            cashierId,
            totalAmount,
            'cashier_order_processing_time',
            Number(cashier_timing_ms) || null,
            JSON.stringify({ sale_id: createdSale.id, items_count: items.length })
          ]
        );

        const highSaleRule = await tx.query(
          `SELECT threshold FROM alert_rules
           WHERE location_id = $1 AND event_type = 'high_sale' AND enabled = true
           ORDER BY updated_at DESC LIMIT 1`,
          [locationId]
        );
        const highSaleThreshold = Number(highSaleRule.rows[0]?.threshold || 0);

        if (highSaleThreshold > 0 && totalAmount >= highSaleThreshold) {
          await tx.query(
            `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
             SELECT id, $1, 'High Sale Alert', $2, 'sales_anomaly'
             FROM users WHERE role IN ('admin', 'manager') AND location_id = $1`,
            [locationId, `Sale ${receiptNumber} reached $${Number(totalAmount).toFixed(2)} (threshold $${highSaleThreshold.toFixed(2)}).`]
          );
        }

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            cashierId,
            locationId,
            'sale_created',
            `Sale ${receiptNumber} - Total: ${totalAmount}`,
            JSON.stringify({ sale_id: createdSale.id, receipt_number: receiptNumber, items_count: items.length }),
          ]
        );

        const completeSale = await getSaleWithItems(createdSale.id, tx);

        if (idempotencyKey) {
          await tx.query(
            `INSERT INTO idempotency_keys (user_id, location_id, idempotency_key, endpoint, response_payload)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
            [cashierId, locationId, idempotencyKey, '/api/sales', JSON.stringify(completeSale)]
          );
        }

        return completeSale;
      });

      res.status(201).json(sale);
    } catch (err) {
      console.error('Create sale error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
    }
  }
);

router.get('/', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const limit = parseInt(req.query.limit, 10) || 100;
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    let queryText = `
      SELECT s.*, u.username as cashier_name,
             (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count
      FROM sales s
      JOIN users u ON s.cashier_id = u.id
      WHERE s.location_id = $1
    `;

    const params = [locationId];

    if (startDate) {
      params.push(startDate);
      queryText += ` AND s.sale_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND s.sale_date <= $${params.length}`;
    }

    queryText += ` ORDER BY s.sale_date DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get sales error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const sale = await getSaleWithItems(req.params.id);
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    res.json(sale);
  } catch (err) {
    console.error('Get sale error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/void', authenticateToken, authorizeRoles('admin', 'cashier', 'manager'), async (req, res) => {
  const VOID_WINDOW_MINUTES = 20;
  const saleId = parseInt(req.params.id, 10);
  
  if (!Number.isInteger(saleId)) {
    return res.status(400).json({ error: 'Invalid sale ID', code: 'INVALID_SALE_ID' });
  }
  
  const { reason } = req.body;

  try {
    const locationId = await getTargetLocationId(req, query);
    
    const result = await withTransaction(async (tx) => {
      const saleResult = await tx.query(
        `SELECT s.*, u.username as cashier_name
         FROM sales s
         JOIN users u ON s.cashier_id = u.id
         WHERE s.id = $1 AND s.location_id = $2`,
        [saleId, locationId]
      );
      
      if (saleResult.rows.length === 0) {
        const err = new Error('Sale not found');
        err.status = 404;
        throw err;
      }
      
      const sale = saleResult.rows[0];
      
      if (sale.status === 'voided') {
        const err = new Error('Sale has already been voided');
        err.status = 400;
        throw err;
      }
      
      const saleTime = new Date(sale.sale_date);
      const now = new Date();
      const minutesSinceSale = (now - saleTime) / (1000 * 60);
      
      if (req.user.role !== 'admin' && minutesSinceSale > VOID_WINDOW_MINUTES) {
        const err = new Error(`Sale can only be voided within ${VOID_WINDOW_MINUTES} minutes. This sale was made ${Math.floor(minutesSinceSale)} minutes ago.`);
        err.status = 403;
        err.code = 'VOID_WINDOW_EXPIRED';
        throw err;
      }
      
      const itemsResult = await tx.query(
        `SELECT si.*, p.name as product_name
         FROM sale_items si
         JOIN products p ON si.product_id = p.id
         WHERE si.sale_id = $1`,
        [saleId]
      );
      
      for (const item of itemsResult.rows) {
        const inventoryResult = await tx.query(
          `UPDATE inventory
           SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP
           WHERE product_id = $2 AND location_id = $3
           RETURNING quantity`,
          [item.quantity, item.product_id, locationId]
        );
        
        if (inventoryResult.rows.length === 0) {
          await tx.query(
            `INSERT INTO inventory (product_id, location_id, quantity, last_updated)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
            [item.product_id, locationId, item.quantity]
          );
        }
        
        await tx.query(
          `INSERT INTO inventory_movements
           (location_id, product_id, movement_type, quantity_change, source, reference_type, reference_id, created_by, metadata)
           VALUES ($1, $2, 'sale_out', $3, 'sale', 'void', $4, $5, $6)`,
          [
            locationId, 
            item.product_id, 
            item.quantity, 
            saleId, 
            req.user.id, 
            JSON.stringify({ action: 'void_restore', void_reason: reason || 'No reason provided' })
          ]
        );
      }
      
      await tx.query(
        `UPDATE sales SET status = 'voided' WHERE id = $1`,
        [saleId]
      );
      
      await tx.query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
         VALUES ($1, $2, 'sale_voided', $3, $4)`,
        [
          req.user.id,
          locationId,
          `Voided sale ${sale.receipt_number}`,
          JSON.stringify({
            sale_id: saleId,
            receipt_number: sale.receipt_number,
            original_amount: sale.total_amount,
            reason: reason || 'No reason provided',
            minutes_since_sale: Math.floor(minutesSinceSale)
          })
        ]
      );
      
      const voidedSale = await getSaleWithItems(saleId, tx);
      voidedSale.voided = true;
      voidedSale.void_reason = reason || 'No reason provided';
      voidedSale.voided_at = now.toISOString();
      
      return voidedSale;
    });
    
    res.json(result);
  } catch (err) {
    console.error('Void sale error:', err);
    res.status(err.status || 500).json({ 
      error: err.message || 'Internal server error',
      code: err.code || 'VOID_ERROR'
    });
  }
});

async function getSaleWithItems(saleId, tx = null) {
  const executor = tx || { query };

  const saleResult = await executor.query(
    `SELECT s.*, u.username as cashier_name
     FROM sales s
     JOIN users u ON s.cashier_id = u.id
     WHERE s.id = $1`,
    [saleId]
  );

  if (saleResult.rows.length === 0) {
    return null;
  }

  const itemsResult = await executor.query(
    `SELECT si.*, p.name as product_name, p.unit
     FROM sale_items si
     JOIN products p ON si.product_id = p.id
     WHERE si.sale_id = $1`,
    [saleId]
  );

  const sale = saleResult.rows[0];
  sale.items = itemsResult.rows;
  return sale;
}

export default router;
