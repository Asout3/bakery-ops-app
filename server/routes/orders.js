import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';
import { consumeStockBatches } from '../services/stockBatchService.js';
import { createLowStockNotificationIfNeeded } from '../services/stockAlertService.js';
import { insertNotificationsForRecipients } from '../services/notificationDispatchService.js';
import { roundCurrency } from '../utils/money.js';
import { AppError } from '../utils/errors.js';

const router = express.Router();

const STATUS_FLOW = ['pending', 'in_production', 'ready', 'picked_up', 'delivered', 'cancelled'];
const PREP_STATUS_FLOW = ['not_started', 'preparing', 'ready'];
const ORDER_EDIT_WINDOW_MINUTES = 20;

async function resolveEffectiveActor(tx, req, locationId) {
  const queuedActorIdHeader = req.headers['x-offline-actor-id'];
  const isFromOfflineQueue = req.headers['x-queued-request'] === 'true';
  if (!isFromOfflineQueue || !queuedActorIdHeader) return { actorId: req.user.id, actorName: req.user.username };

  const queuedActorId = Number(queuedActorIdHeader);
  const actorResult = await tx.query(
    'SELECT id, username FROM users WHERE id = $1 AND is_active = true AND (location_id = $2 OR location_id IS NULL)',
    [queuedActorId, locationId]
  );
  if (!actorResult.rows.length || queuedActorId !== Number(req.user.id)) {
    const err = new Error('Offline actor mismatch is not allowed');
    err.status = 403;
    throw err;
  }

  return { actorId: Number(actorResult.rows[0].id), actorName: actorResult.rows[0].username };
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampLimit(value, fallback = 100, max = 300) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

function hasPaginationRequest(req) {
  return req.query.limit !== undefined || req.query.cursor_created_at !== undefined || req.query.cursor_id !== undefined;
}

function isWithinEditWindow(createdAt) {
  if (!createdAt) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs <= ORDER_EDIT_WINDOW_MINUTES * 60 * 1000;
}

async function notifyRoles(tx, locationId, roles, title, message, notificationType) {
  await insertNotificationsForRecipients(tx, {
    locationId,
    title,
    message,
    notificationType,
    includeAdmins: roles.includes('admin'),
    includeManagers: roles.includes('manager'),
    includeCashiers: roles.includes('cashier'),
  });
}

async function getOrderById(orderId) {
  const orderResult = await query(
    `SELECT o.*, COALESCE(NULLIF(o.total_amount, 0), item_totals.items_total, 0) AS total_amount, u.username AS cashier_name,
            CASE WHEN COALESCE(NULLIF(o.total_amount, 0), item_totals.items_total, 0) > 0 AND COALESCE(o.paid_amount, 0) >= COALESCE(NULLIF(o.total_amount, 0), item_totals.items_total, 0) THEN 'verified' ELSE 'pending' END AS payment_status,
            CONCAT('ORD-', LPAD(o.id::text, 6, '0')) AS order_code
     FROM customer_orders o
     LEFT JOIN users u ON u.id = o.cashier_id
     LEFT JOIN (SELECT order_id, COALESCE(SUM(subtotal), 0) AS items_total FROM order_items GROUP BY order_id) item_totals ON item_totals.order_id = o.id
     WHERE o.id = $1`,
    [orderId]
  );

  if (!orderResult.rows.length) return null;

  const itemsResult = await query(
    `SELECT oi.id, oi.order_id, oi.product_id, oi.custom_item_name, p.name AS product_name,
            oi.quantity, oi.unit_price, oi.subtotal, oi.prep_status
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE order_id = $1
     ORDER BY oi.id ASC`,
    [orderId]
  );

  return { ...orderResult.rows[0], items: itemsResult.rows };
}

router.get('/', authenticateToken, authorizeRoles('admin', 'manager', 'cashier'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const includeCompleted = req.query.include_completed === 'true';
    const paginationRequested = hasPaginationRequest(req);
    const limit = paginationRequested ? clampLimit(req.query.limit) : 300;
    const cursorCreatedAt = req.query.cursor_created_at ? new Date(String(req.query.cursor_created_at)) : null;
    const cursorId = Number(req.query.cursor_id || 0) || null;

    const params = [locationId];
    const where = ['o.location_id = $1'];

    if (req.user.role === 'cashier') {
      params.push(req.user.id);
      where.push(`o.cashier_id = $${params.length}`);
    }

    if (!includeCompleted) {
      where.push(`o.status <> 'picked_up'`);
      where.push(`o.status <> 'delivered'`);
      where.push(`o.status <> 'cancelled'`);
    }

    if (cursorCreatedAt && !Number.isNaN(cursorCreatedAt.getTime()) && cursorId) {
      params.push(cursorCreatedAt.toISOString(), cursorId);
      where.push(`(o.created_at, o.id) < ($${params.length - 1}::timestamptz, $${params.length}::int)`);
    }

    params.push(limit + 1);
    const ordersResult = await query(
      `SELECT o.*, COALESCE(NULLIF(o.total_amount, 0), item_totals.items_total, 0) AS total_amount, u.username AS cashier_name,
              CASE WHEN COALESCE(NULLIF(o.total_amount, 0), item_totals.items_total, 0) > 0 AND COALESCE(o.paid_amount, 0) >= COALESCE(NULLIF(o.total_amount, 0), item_totals.items_total, 0) THEN 'verified' ELSE 'pending' END AS payment_status,
              CONCAT('ORD-', LPAD(o.id::text, 6, '0')) AS order_code
       FROM customer_orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       LEFT JOIN (SELECT order_id, COALESCE(SUM(subtotal), 0) AS items_total FROM order_items GROUP BY order_id) item_totals ON item_totals.order_id = o.id
       WHERE ${where.join(' AND ')}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT $${params.length}`,
      params
    );

    const pageRows = ordersResult.rows.slice(0, limit);
    const nextRow = ordersResult.rows.length > limit ? pageRows[pageRows.length - 1] : null;
    if (nextRow) {
      res.setHeader('X-Next-Cursor-Created-At', new Date(nextRow.created_at).toISOString());
      res.setHeader('X-Next-Cursor-Id', String(nextRow.id));
    }
    res.setHeader('X-Page-Limit', String(limit));
    res.setHeader('X-Has-More', nextRow ? 'true' : 'false');

    const orderIds = pageRows.map((row) => row.id);
    let itemsByOrder = new Map();

    if (orderIds.length) {
      const itemsResult = await query(
        `SELECT oi.id, oi.order_id, oi.product_id, oi.custom_item_name, p.name AS product_name,
                oi.quantity, oi.unit_price, oi.subtotal, oi.prep_status
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE order_id = ANY($1::int[])
         ORDER BY oi.id ASC`,
        [orderIds]
      );

      itemsByOrder = itemsResult.rows.reduce((map, item) => {
        if (!map.has(item.order_id)) map.set(item.order_id, []);
        map.get(item.order_id).push(item);
        return map;
      }, new Map());
    }

    res.json(pageRows.map((order) => ({ ...order, items: itemsByOrder.get(order.id) || [] })));
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
  body('payment_method').optional().isIn(['cash', 'mobile', 'telebirr']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    const idempotencyKey = req.headers['x-idempotency-key'];
    const isFromOfflineQueue = req.headers['x-queued-request'] === 'true';

    if (isFromOfflineQueue && !idempotencyKey) {
      return res.status(400).json({ error: 'Queued orders require an idempotency key', code: 'IDEMPOTENCY_KEY_REQUIRED', requestId: req.requestId });
    }

    try {
      const locationId = await getTargetLocationId(req, query);
      const { customer_name, customer_phone, customer_note, pickup_at, payment_method, paid_amount, items } = req.body;

      const created = await withTransaction(async (tx) => {
        const effectiveActor = await resolveEffectiveActor(tx, req, locationId);
        if (idempotencyKey) {
          await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`orders:${effectiveActor.actorId}:${idempotencyKey}`]);
          const existing = await tx.query(
            `SELECT response_payload FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3`,
            [effectiveActor.actorId, idempotencyKey, '/api/orders']
          );
          if (existing.rows.length > 0) {
            return typeof existing.rows[0].response_payload === 'string' ? JSON.parse(existing.rows[0].response_payload) : existing.rows[0].response_payload;
          }
        }

        let totalAmount = 0;
        const normalizedItems = [];
        const productIds = [...new Set(items.map((item) => Number(item.product_id || 0)).filter(Boolean))];
        const productsById = new Map();
        if (productIds.length) {
          const productResult = await tx.query('SELECT id, name, price FROM products WHERE id = ANY($1::int[])', [productIds]);
          productResult.rows.forEach((product) => productsById.set(Number(product.id), product));
          const missingProductId = productIds.find((productId) => !productsById.has(productId));
          if (missingProductId) {
            throw new AppError(`Product ${missingProductId} not found`, 404, 'PRODUCT_NOT_FOUND');
          }
        }

        for (const rawItem of items) {
          const qty = normalizeNumber(rawItem.quantity);
          const productId = rawItem.product_id ? Number(rawItem.product_id) : null;
          let itemName = typeof rawItem.custom_item_name === 'string' ? rawItem.custom_item_name.trim() : '';
          let unitPrice = normalizeNumber(rawItem.unit_price, 0);
          if (unitPrice < 0) {
            throw new AppError('unit_price cannot be negative', 400, 'VALIDATION_ERROR');
          }

          if (productId) {
            const product = productsById.get(productId);
            itemName = product.name;
            unitPrice = normalizeNumber(product.price, 0);
          }

          if (!productId && !itemName) {
            throw new AppError('custom_item_name is required for custom order items', 400, 'VALIDATION_ERROR');
          }

          const subtotal = roundCurrency(unitPrice * qty);
          totalAmount = roundCurrency(totalAmount + subtotal);
          normalizedItems.push({ product_id: productId, custom_item_name: productId ? null : itemName, quantity: qty, unit_price: unitPrice, subtotal });
        }

        const orderDetails = normalizedItems.map((item) => `${item.product_id ? `Product#${item.product_id}` : item.custom_item_name} x${item.quantity}`).join(', ');
        const normalizedPaidAmount = normalizeNumber(paid_amount, 0);
        if (normalizedPaidAmount > totalAmount) {
          throw new AppError('Paid amount cannot be greater than the order total.', 400, 'ORDER_OVERPAY_NOT_ALLOWED');
        }

        const orderResult = await tx.query(
          `INSERT INTO customer_orders
             (location_id, cashier_id, customer_name, customer_phone, customer_note, order_details, pickup_at,
              total_amount, paid_amount, payment_method, status, prep_status, prep_progress)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', 'not_started', 0)
           RETURNING *`,
          [locationId, effectiveActor.actorId, customer_name, customer_phone, customer_note || null, orderDetails, pickup_at || new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(), totalAmount, normalizedPaidAmount, payment_method || 'cash']
        );

        const order = orderResult.rows[0];

        const itemValues = [];
        const itemPlaceholders = normalizedItems.map((item, index) => {
          const offset = index * 6;
          itemValues.push(order.id, item.product_id, item.custom_item_name, item.quantity, item.unit_price, item.subtotal);
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, 'not_started')`;
        });
        await tx.query(
          `INSERT INTO order_items (order_id, product_id, custom_item_name, quantity, unit_price, subtotal, prep_status)
           VALUES ${itemPlaceholders.join(', ')}`,
          itemValues
        );

        await notifyRoles(tx, locationId, ['manager', 'admin', 'cashier'], 'New Pre-Order', `Pre-order #${order.id} created by ${effectiveActor.actorName}.`, 'order_created');

        if (idempotencyKey) {
          await tx.query(
            `INSERT INTO idempotency_keys (user_id, location_id, idempotency_key, endpoint, response_payload)
             VALUES ($1, $2, $3, '/api/orders', $4)
             ON CONFLICT (user_id, idempotency_key, endpoint) DO NOTHING`,
            [effectiveActor.actorId, locationId, idempotencyKey, JSON.stringify(order)]
          );
        }

        return order;
      });

      const fullOrder = await getOrderById(created.id);
      res.status(201).json(fullOrder);
    } catch (err) {
      console.error('Create order error:', err);
      res.status(err.status || err.statusCode || 500).json({ error: err.message || 'Internal server error', code: err.code || 'ORDER_CREATE_ERROR', requestId: req.requestId });
    }
  }
);

router.patch('/:id', authenticateToken, authorizeRoles('admin', 'manager', 'cashier'), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId)) {
      return res.status(400).json({ error: 'Invalid order id', code: 'VALIDATION_ERROR', requestId: req.requestId });
    }

    const locationId = await getTargetLocationId(req, query);
    const { status, prep_status, prep_progress, paid_amount, verify_payment, customer_note, pickup_at, customer_name, customer_phone } = req.body;

    if (status && !STATUS_FLOW.includes(status)) return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR', requestId: req.requestId });
    if (prep_status && !PREP_STATUS_FLOW.includes(prep_status)) return res.status(400).json({ error: 'Invalid prep_status', code: 'VALIDATION_ERROR', requestId: req.requestId });

    const updated = await withTransaction(async (tx) => {
      const existingResult = await tx.query('SELECT * FROM customer_orders WHERE id = $1 AND location_id = $2 FOR UPDATE', [orderId, locationId]);
      if (!existingResult.rows.length) {
        const e = new Error('Order not found');
        e.status = 404;
        throw e;
      }

      const order = existingResult.rows[0];
      if (req.user.role === 'cashier' && Number(order.cashier_id) !== Number(req.user.id)) {
        const e = new Error('Forbidden');
        e.status = 403;
        throw e;
      }

      const isFinalState = ['picked_up', 'delivered', 'cancelled'].includes(order.status);
      if (isFinalState) {
        const e = new Error('Finalized orders cannot be edited.');
        e.status = 403;
        e.code = 'ORDER_FINALIZED';
        throw e;
      }

      if (order.prep_status === 'ready' && ((prep_status && prep_status !== 'ready') || (status && status === 'in_production'))) {
        const e = new Error('Ready orders cannot be moved back to preparing.');
        e.status = 400;
        e.code = 'ORDER_ALREADY_READY';
        throw e;
      }

      let nextStatus = status || order.status;
      if (nextStatus === 'delivered') nextStatus = 'picked_up';
      let nextPrepStatus = prep_status || order.prep_status;
      const nextPrepProgress = prep_progress === undefined || prep_progress === null ? Number(order.prep_progress || 0) : Math.max(0, Math.min(100, Number(prep_progress)));

      if (req.user.role === 'manager') {
        if (nextPrepStatus === 'ready' && nextStatus === 'pending') nextStatus = 'ready';
        if (nextStatus === 'ready') nextPrepStatus = 'ready';
      }

      const itemTotalsResult = await tx.query('SELECT COALESCE(SUM(subtotal), 0) AS items_total FROM order_items WHERE order_id = $1', [orderId]);
      const effectiveTotalAmount = Number(order.total_amount || 0) > 0 ? Number(order.total_amount || 0) : Number(itemTotalsResult.rows[0]?.items_total || 0);

      if (Number(order.total_amount || 0) !== effectiveTotalAmount) {
        await tx.query('UPDATE customer_orders SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [effectiveTotalAmount, orderId]);
      }

      let nextPaidAmount = paid_amount === undefined ? Number(order.paid_amount || 0) : normalizeNumber(paid_amount, Number(order.paid_amount || 0));
      if (verify_payment === true) nextPaidAmount = effectiveTotalAmount;
      if (nextStatus === 'picked_up' && nextPaidAmount < effectiveTotalAmount) {
        const e = new Error('Payment must be verified before pickup.');
        e.status = 400;
        e.code = 'ORDER_PICKUP_PAYMENT_REQUIRED';
        throw e;
      }
      if ((paid_amount !== undefined || verify_payment === true) && nextPaidAmount > effectiveTotalAmount) {
        const e = new Error('Paid amount cannot be greater than order total.');
        e.status = 400;
        e.code = 'ORDER_OVERPAY_NOT_ALLOWED';
        throw e;
      }

      const shouldApplyInventory = (nextPrepStatus === 'ready' || nextStatus === 'ready') && order.inventory_applied !== true;

      if (shouldApplyInventory) {
        const itemsResult = await tx.query('SELECT * FROM order_items WHERE order_id = $1 FOR UPDATE', [orderId]);
        const movementItems = [];
        for (const item of itemsResult.rows) {
          if (!item.product_id) continue;
          await consumeStockBatches(tx, {
            productId: Number(item.product_id),
            locationId,
            quantity: Number(item.quantity),
            createdBy: req.user.id,
            referenceType: 'order',
            referenceId: orderId,
            metadata: { order_id: orderId },
          });
          movementItems.push({ productId: Number(item.product_id), quantity: Number(item.quantity) });
          await tx.query("UPDATE order_items SET prep_status = 'ready' WHERE id = $1", [item.id]);
        }

        for (const movement of movementItems) {
          await tx.query(
            `INSERT INTO inventory_movements (location_id, product_id, movement_type, quantity_change, source, reference_type, reference_id, created_by, metadata)
             VALUES ($1, $2, 'sale_out', $3, 'sale', 'order', $4, $5, $6)`,
            [locationId, movement.productId, -movement.quantity, orderId, req.user.id, JSON.stringify({ order_id: orderId })]
          );
          await createLowStockNotificationIfNeeded(tx, locationId, movement.productId);
        }
      }

      const updateResult = await tx.query(
        `UPDATE customer_orders
         SET status = $1::varchar,
             prep_status = $2::varchar,
             prep_progress = $3::int,
             paid_amount = $4::numeric,
             customer_note = COALESCE($5::text, customer_note),
             pickup_at = COALESCE($6::timestamp, pickup_at),
             customer_name = COALESCE($7::varchar, customer_name),
             customer_phone = COALESCE($8::varchar, customer_phone),
             inventory_applied = CASE WHEN $9::boolean THEN true ELSE inventory_applied END,
             updated_at = CURRENT_TIMESTAMP,
             baked_done = CASE WHEN $2::varchar = 'ready' THEN true ELSE baked_done END,
             baked_done_at = CASE WHEN $2::varchar = 'ready' THEN CURRENT_TIMESTAMP ELSE baked_done_at END,
             baked_done_by = CASE WHEN $2::varchar = 'ready' THEN $10 ELSE baked_done_by END,
             delivered_at = CASE WHEN $1::varchar = 'picked_up' THEN CURRENT_TIMESTAMP ELSE delivered_at END
         WHERE id = $11
         RETURNING *`,
        [nextStatus, nextPrepStatus, nextPrepProgress, nextPaidAmount, customer_note ?? null, pickup_at ?? null, customer_name ?? null, customer_phone ?? null, shouldApplyInventory, req.user.id, orderId]
      );

      await notifyRoles(tx, locationId, ['admin', 'manager', 'cashier'], 'Pre-Order Updated', `Order #${orderId} updated to ${nextStatus} / ${nextPrepStatus}.`, 'order_updated');

      return updateResult.rows[0];
    });

    const fullOrder = await getOrderById(updated.id);
    res.json(fullOrder);
  } catch (err) {
    console.error('Update order error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code || 'ORDER_UPDATE_ERROR', requestId: req.requestId });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin', 'cashier'), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId)) return res.status(400).json({ error: 'Invalid order id', code: 'VALIDATION_ERROR', requestId: req.requestId });

    const locationId = await getTargetLocationId(req, query);

    await withTransaction(async (tx) => {
      const existing = await tx.query('SELECT * FROM customer_orders WHERE id = $1 AND location_id = $2 FOR UPDATE', [orderId, locationId]);
      if (!existing.rows.length) {
        const e = new Error('Order not found');
        e.status = 404;
        throw e;
      }
      const order = existing.rows[0];
      if (req.user.role === 'cashier' && Number(order.cashier_id) !== Number(req.user.id)) {
        const e = new Error('Forbidden');
        e.status = 403;
        throw e;
      }
      if (!isWithinEditWindow(order.created_at)) {
        const e = new Error(`Orders can only be deleted within ${ORDER_EDIT_WINDOW_MINUTES} minutes from creation.`);
        e.status = 403;
        e.code = 'ORDER_EDIT_WINDOW_EXPIRED';
        throw e;
      }
      await tx.query('DELETE FROM customer_orders WHERE id = $1', [orderId]);
      await notifyRoles(tx, locationId, ['admin', 'cashier'], 'Pre-Order Deleted', `Order #${orderId} was deleted.`, 'order_deleted');
    });

    res.json({ message: 'Order deleted successfully', code: 'ORDER_DELETED' });
  } catch (err) {
    console.error('Delete order error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code || 'ORDER_DELETE_ERROR', requestId: req.requestId });
  }
});

export default router;
