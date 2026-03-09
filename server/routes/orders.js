import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();

const STATUS_FLOW = ['pending', 'in_production', 'ready', 'picked_up', 'cancelled'];
const PREP_STATUS_FLOW = ['not_started', 'preparing', 'ready'];

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function getOrderById(orderId) {
  const orderResult = await query(
    `SELECT o.*, u.username AS cashier_name,
            CASE WHEN COALESCE(o.paid_amount, 0) >= COALESCE(o.total_amount, 0) THEN 'verified' ELSE 'pending' END AS payment_status
     FROM customer_orders o
     LEFT JOIN users u ON u.id = o.cashier_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (!orderResult.rows.length) return null;

  const itemsResult = await query(
    `SELECT id, order_id, product_id, custom_item_name, quantity, unit_price, subtotal, prep_status
     FROM order_items
     WHERE order_id = $1
     ORDER BY id ASC`,
    [orderId]
  );

  return { ...orderResult.rows[0], items: itemsResult.rows };
}

router.get('/', authenticateToken, authorizeRoles('admin', 'manager', 'cashier'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const includeCompleted = req.query.include_completed === 'true';

    const params = [locationId];
    const where = ['o.location_id = $1'];

    if (req.user.role === 'cashier') {
      params.push(req.user.id);
      where.push(`o.cashier_id = $${params.length}`);
    }

    if (!includeCompleted) {
      where.push(`o.status <> 'picked_up'`);
      where.push(`o.status <> 'cancelled'`);
    }

    const ordersResult = await query(
      `SELECT o.*, u.username AS cashier_name,
              CASE WHEN COALESCE(o.paid_amount, 0) >= COALESCE(o.total_amount, 0) THEN 'verified' ELSE 'pending' END AS payment_status
       FROM customer_orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       WHERE ${where.join(' AND ')}
       ORDER BY o.created_at DESC
       LIMIT 300`,
      params
    );

    const orderIds = ordersResult.rows.map((row) => row.id);
    let itemsByOrder = new Map();

    if (orderIds.length) {
      const itemsResult = await query(
        `SELECT id, order_id, product_id, custom_item_name, quantity, unit_price, subtotal, prep_status
         FROM order_items
         WHERE order_id = ANY($1::int[])
         ORDER BY id ASC`,
        [orderIds]
      );

      itemsByOrder = itemsResult.rows.reduce((map, item) => {
        if (!map.has(item.order_id)) map.set(item.order_id, []);
        map.get(item.order_id).push(item);
        return map;
      }, new Map());
    }

    res.json(ordersResult.rows.map((order) => ({ ...order, items: itemsByOrder.get(order.id) || [] })));
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'ORDERS_FETCH_ERROR', requestId: req.requestId });
  }
});

router.post('/',
  authenticateToken,
  authorizeRoles('admin', 'cashier'),
  body('customer_name').trim().notEmpty(),
  body('customer_phone').trim().notEmpty(),
  body('items').isArray({ min: 1 }),
  body('items.*.quantity').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    const idempotencyKey = req.headers['x-idempotency-key'];

    try {
      const locationId = await getTargetLocationId(req, query);
      const { customer_name, customer_phone, customer_note, pickup_at, payment_method, paid_amount, items } = req.body;

      const created = await withTransaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.query(
            `SELECT response_payload FROM idempotency_keys
             WHERE user_id = $1 AND idempotency_key = $2`,
            [req.user.id, idempotencyKey]
          );
          if (existing.rows.length > 0) {
            return typeof existing.rows[0].response_payload === 'string'
              ? JSON.parse(existing.rows[0].response_payload)
              : existing.rows[0].response_payload;
          }
        }

        let totalAmount = 0;
        const normalizedItems = [];

        for (const rawItem of items) {
          const qty = normalizeNumber(rawItem.quantity);
          const productId = rawItem.product_id ? Number(rawItem.product_id) : null;
          let itemName = typeof rawItem.custom_item_name === 'string' ? rawItem.custom_item_name.trim() : '';
          let unitPrice = normalizeNumber(rawItem.unit_price, 0);

          if (productId) {
            const productResult = await tx.query('SELECT name, price FROM products WHERE id = $1 LIMIT 1', [productId]);
            if (!productResult.rows.length) {
              const e = new Error(`Product ${productId} not found`);
              e.status = 404;
              throw e;
            }
            itemName = productResult.rows[0].name;
            if (!Number.isFinite(Number(rawItem.unit_price))) {
              unitPrice = normalizeNumber(productResult.rows[0].price, 0);
            }
          }

          if (!productId && !itemName) {
            const e = new Error('custom_item_name is required for custom order items');
            e.status = 400;
            throw e;
          }

          const subtotal = unitPrice * qty;
          totalAmount += subtotal;
          normalizedItems.push({ product_id: productId, custom_item_name: productId ? null : itemName, quantity: qty, unit_price: unitPrice, subtotal });
        }

        const orderDetails = normalizedItems
          .map((item) => `${item.product_id ? `Product#${item.product_id}` : item.custom_item_name} x${item.quantity}`)
          .join(', ');

        const orderResult = await tx.query(
          `INSERT INTO customer_orders
             (location_id, cashier_id, customer_name, customer_phone, customer_note, order_details, pickup_at,
              total_amount, paid_amount, payment_method, status, prep_status, prep_progress)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', 'not_started', 0)
           RETURNING *`,
          [
            locationId,
            req.user.id,
            customer_name,
            customer_phone,
            customer_note || null,
            orderDetails,
            pickup_at || new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(),
            totalAmount,
            normalizeNumber(paid_amount, 0),
            payment_method || 'cash',
          ]
        );

        const order = orderResult.rows[0];

        for (const item of normalizedItems) {
          await tx.query(
            `INSERT INTO order_items
               (order_id, product_id, custom_item_name, quantity, unit_price, subtotal, prep_status)
             VALUES ($1, $2, $3, $4, $5, $6, 'not_started')`,
            [order.id, item.product_id, item.custom_item_name, item.quantity, item.unit_price, item.subtotal]
          );
        }

        await tx.query(
          `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
           SELECT id, $1, 'New Pre-Order', $2, 'order_created'
           FROM users
           WHERE role IN ('manager', 'admin') AND is_active = true AND location_id = $1`,
          [locationId, `Pre-order #${order.id} created by ${req.user.username}.`]
        );

        if (idempotencyKey) {
          await tx.query(
            `INSERT INTO idempotency_keys (user_id, location_id, idempotency_key, endpoint, response_payload)
             VALUES ($1, $2, $3, '/api/orders', $4)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
            [req.user.id, locationId, idempotencyKey, JSON.stringify(order)]
          );
        }

        return order;
      });

      const fullOrder = await getOrderById(created.id);
      res.status(201).json(fullOrder);
    } catch (err) {
      console.error('Create order error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'ORDER_CREATE_ERROR', requestId: req.requestId });
    }
  }
);

router.patch('/:id', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId)) {
      return res.status(400).json({ error: 'Invalid order id', code: 'VALIDATION_ERROR', requestId: req.requestId });
    }

    const locationId = await getTargetLocationId(req, query);
    const { status, prep_status, prep_progress, paid_amount, verify_payment } = req.body;

    if (status && !STATUS_FLOW.includes(status)) {
      return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR', requestId: req.requestId });
    }
    if (prep_status && !PREP_STATUS_FLOW.includes(prep_status)) {
      return res.status(400).json({ error: 'Invalid prep_status', code: 'VALIDATION_ERROR', requestId: req.requestId });
    }

    const updated = await withTransaction(async (tx) => {
      const existingResult = await tx.query(
        `SELECT * FROM customer_orders WHERE id = $1 AND location_id = $2 FOR UPDATE`,
        [orderId, locationId]
      );

      if (!existingResult.rows.length) {
        const e = new Error('Order not found');
        e.status = 404;
        throw e;
      }

      const order = existingResult.rows[0];

      let nextStatus = status || order.status;
      let nextPrepStatus = prep_status || order.prep_status;
      const nextPrepProgress = prep_progress === undefined || prep_progress === null
        ? Number(order.prep_progress || 0)
        : Math.max(0, Math.min(100, Number(prep_progress)));

      if (req.user.role === 'manager') {
        if (nextPrepStatus === 'ready' && nextStatus === 'pending') {
          nextStatus = 'ready';
        }
        if (nextStatus === 'ready') {
          nextPrepStatus = 'ready';
        }
      }

      let nextPaidAmount = paid_amount === undefined ? Number(order.paid_amount || 0) : normalizeNumber(paid_amount, Number(order.paid_amount || 0));
      if (verify_payment === true) {
        nextPaidAmount = Number(order.total_amount || 0);
      }

      const shouldApplyInventory = (nextPrepStatus === 'ready' || nextStatus === 'ready') && order.inventory_applied !== true;

      if (shouldApplyInventory) {
        const itemsResult = await tx.query('SELECT * FROM order_items WHERE order_id = $1 FOR UPDATE', [orderId]);

        for (const item of itemsResult.rows) {
          if (!item.product_id) continue;

          const invResult = await tx.query(
            `UPDATE inventory
             SET quantity = quantity - $1, last_updated = CURRENT_TIMESTAMP
             WHERE product_id = $2 AND location_id = $3 AND quantity >= $1
             RETURNING quantity`,
            [Number(item.quantity), Number(item.product_id), locationId]
          );

          if (!invResult.rows.length) {
            const e = new Error(`Insufficient inventory for product ${item.product_id} while preparing order.`);
            e.status = 400;
            throw e;
          }

          await tx.query(
            `INSERT INTO inventory_movements
               (location_id, product_id, movement_type, quantity_change, source, reference_type, reference_id, created_by, metadata)
             VALUES ($1, $2, 'sale_out', $3, 'order_prepared', 'order', $4, $5, $6)`,
            [locationId, Number(item.product_id), -Number(item.quantity), orderId, req.user.id, JSON.stringify({ order_id: orderId })]
          );

          await tx.query('UPDATE order_items SET prep_status = $1 WHERE id = $2', ['ready', item.id]);
        }
      }

      const updateResult = await tx.query(
        `UPDATE customer_orders
         SET status = $1,
             prep_status = $2,
             prep_progress = $3,
             paid_amount = $4,
             inventory_applied = CASE WHEN $5 THEN true ELSE inventory_applied END,
             updated_at = CURRENT_TIMESTAMP,
             baked_done = CASE WHEN $2 = 'ready' THEN true ELSE baked_done END,
             baked_done_at = CASE WHEN $2 = 'ready' THEN CURRENT_TIMESTAMP ELSE baked_done_at END,
             baked_done_by = CASE WHEN $2 = 'ready' THEN $6 ELSE baked_done_by END,
             delivered_at = CASE WHEN $1 = 'picked_up' THEN CURRENT_TIMESTAMP ELSE delivered_at END
         WHERE id = $7
         RETURNING *`,
        [nextStatus, nextPrepStatus, nextPrepProgress, nextPaidAmount, shouldApplyInventory, req.user.id, orderId]
      );

      if (req.user.role === 'manager' && (nextPrepStatus === 'ready' || nextStatus === 'ready')) {
        await tx.query(
          `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
           SELECT id, $1, 'Pre-Order Ready', $2, 'order_ready'
           FROM users
           WHERE role = 'admin' AND is_active = true AND location_id = $1`,
          [locationId, `Order #${orderId} marked ready by ${req.user.username}.`]
        );
      }

      return updateResult.rows[0];
    });

    const fullOrder = await getOrderById(updated.id);
    res.json(fullOrder);
  } catch (err) {
    console.error('Update order error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'ORDER_UPDATE_ERROR', requestId: req.requestId });
  }
});

export default router;
