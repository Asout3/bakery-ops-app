import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';
import { AppError, asyncHandler } from '../utils/errors.js';

const router = express.Router();

const ORDER_STATUSES = ['pending', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled', 'overdue'];

function clampLimit(value, fallback = 500, max = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), max);
}

function isPastPickupDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return date.getTime() < Date.now();
}

function validateRequest(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
  }
}

router.post(
  '/',
  authenticateToken,
  authorizeRoles('cashier', 'admin', 'manager'),
  body('customer_name').trim().notEmpty(),
  body('customer_phone').trim().notEmpty(),
  body('order_details').trim().notEmpty(),
  body('pickup_at').isISO8601(),
  body('total_amount').isFloat({ min: 0.01 }),
  body('paid_amount').isFloat({ min: 0 }),
  body('payment_method').isIn(['cash', 'mobile']),
  asyncHandler(async (req, res) => {
    validateRequest(req);

    const locationId = await getTargetLocationId(req, query);
    const { customer_name, customer_phone, order_details, pickup_at, total_amount, paid_amount, payment_method } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'];

    if (isPastPickupDate(pickup_at)) {
      throw new AppError('Pickup time cannot be in the past', 400, 'INVALID_PICKUP_TIME');
    }

    if (Number(paid_amount) > Number(total_amount)) {
      throw new AppError('Paid amount cannot exceed total amount', 400, 'INVALID_PAYMENT_SPLIT');
    }

    const createdOrder = await withTransaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.query(
          `SELECT response_payload FROM idempotency_keys
           WHERE user_id = $1 AND idempotency_key = $2`,
          [req.user.id, idempotencyKey]
        );
        if (existing.rows.length > 0) {
          const payload = existing.rows[0].response_payload;
          return typeof payload === 'string' ? JSON.parse(payload) : payload;
        }
      }

      const inserted = await tx.query(
        `INSERT INTO customer_orders
        (location_id, cashier_id, customer_name, customer_phone, order_details, pickup_at, total_amount, paid_amount, payment_method, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING *`,
        [locationId, req.user.id, customer_name, customer_phone, order_details, pickup_at, total_amount, paid_amount, payment_method]
      );

      const order = inserted.rows[0];

      await tx.query(
        `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
         SELECT id, $1, 'New pickup order', $2, 'order_created'
         FROM users WHERE role = 'manager' AND location_id = $1 AND is_active = true`,
        [locationId, `New order for ${customer_name} is due on ${new Date(pickup_at).toLocaleString()}.`]
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

    res.status(201).json(createdOrder);
  })
);

router.get('/', authenticateToken, authorizeRoles('cashier', 'admin', 'manager'), asyncHandler(async (req, res) => {
  const locationId = await getTargetLocationId(req, query);
  const includeClosed = req.query.include_closed === 'true';
  const limit = clampLimit(req.query.limit, 500, 1000);

  const result = await query(
    `SELECT o.*, u.username AS cashier_name, gm.username AS baked_done_by_name
     FROM customer_orders o
     LEFT JOIN users u ON u.id = o.cashier_id
     LEFT JOIN users gm ON gm.id = o.baked_done_by
     WHERE o.location_id = $1
       ${includeClosed ? '' : "AND o.status NOT IN ('delivered', 'cancelled')"}
     ORDER BY o.pickup_at ASC, o.created_at DESC
     LIMIT $2`,
    [locationId, limit]
  );

  res.json(result.rows.map((row) => ({ ...row, balance_due: Number(row.total_amount) - Number(row.paid_amount) })));
}));

router.put('/:id', authenticateToken, authorizeRoles('cashier', 'admin', 'manager'), asyncHandler(async (req, res) => {
  const locationId = await getTargetLocationId(req, query);
  const orderId = Number(req.params.id);
  const { customer_name, customer_phone, order_details, pickup_at, total_amount, paid_amount, payment_method, status } = req.body;

  if (status && !ORDER_STATUSES.includes(status)) {
    throw new AppError('Invalid status', 400, 'INVALID_ORDER_STATUS');
  }

  const existingOrder = await query('SELECT total_amount, paid_amount, pickup_at FROM customer_orders WHERE id = $1 AND location_id = $2', [orderId, locationId]);
  if (!existingOrder.rows.length) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  const effectiveTotal = total_amount !== undefined ? Number(total_amount) : Number(existingOrder.rows[0].total_amount);
  const effectivePaid = paid_amount !== undefined ? Number(paid_amount) : Number(existingOrder.rows[0].paid_amount);
  if (effectivePaid > effectiveTotal) {
    throw new AppError('Paid amount cannot exceed total amount', 400, 'INVALID_PAYMENT_SPLIT');
  }

  const effectivePickup = pickup_at !== undefined ? pickup_at : existingOrder.rows[0].pickup_at;
  if (isPastPickupDate(effectivePickup) && status !== 'delivered' && status !== 'cancelled' && status !== 'overdue') {
    throw new AppError('Pickup time cannot be in the past', 400, 'INVALID_PICKUP_TIME');
  }

  const result = await query(
    `UPDATE customer_orders
     SET customer_name = COALESCE($1, customer_name),
         customer_phone = COALESCE($2, customer_phone),
         order_details = COALESCE($3, order_details),
         pickup_at = COALESCE($4, pickup_at),
         total_amount = COALESCE($5, total_amount),
         paid_amount = COALESCE($6, paid_amount),
         payment_method = COALESCE($7, payment_method),
         status = COALESCE($8, status),
         delivered_at = CASE WHEN COALESCE($8, status) = 'delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
         cancelled_at = CASE WHEN COALESCE($8, status) = 'cancelled' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
         cancelled_by = CASE WHEN COALESCE($8, status) = 'cancelled' THEN $9 ELSE cancelled_by END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $10 AND location_id = $11
     RETURNING *`,
    [customer_name, customer_phone, order_details, pickup_at, total_amount, paid_amount, payment_method, status, req.user.id, orderId, locationId]
  );

  res.json({ ...result.rows[0], balance_due: Number(result.rows[0].total_amount) - Number(result.rows[0].paid_amount) });
}));

router.put('/:id/baked', authenticateToken, authorizeRoles('manager', 'admin'), asyncHandler(async (req, res) => {
  const locationId = await getTargetLocationId(req, query);
  const orderId = Number(req.params.id);

  const result = await query(
    `UPDATE customer_orders
     SET baked_done = true,
         baked_done_by = $1,
         baked_done_at = CURRENT_TIMESTAMP,
         status = CASE WHEN status IN ('pending', 'confirmed') THEN 'ready' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND location_id = $3
     RETURNING *`,
    [req.user.id, orderId, locationId]
  );

  if (!result.rows.length) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  const order = result.rows[0];
  await query(
    `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
     VALUES ($1, $2, 'Order baked', $3, 'order_baked')`,
    [order.cashier_id, locationId, `Order #${order.id} for ${order.customer_name} is now ready.`]
  );

  res.json({ ...order, balance_due: Number(order.total_amount) - Number(order.paid_amount) });
}));

export async function processOrderDueNotifications() {
  const dueRows = await query(
    `SELECT o.*, ARRAY_AGG(u.id) FILTER (WHERE u.id IS NOT NULL) AS manager_ids
     FROM customer_orders o
     LEFT JOIN users u ON u.location_id = o.location_id AND u.role = 'manager' AND u.is_active = true
     WHERE o.status NOT IN ('delivered', 'cancelled')
     GROUP BY o.id`
  );

  for (const order of dueRows.rows) {
    const daysLeft = Math.ceil((new Date(order.pickup_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if ([3, 2, 1].includes(daysLeft)) {
      const recipientIds = [...new Set([...(order.manager_ids || []), order.cashier_id].filter(Boolean))];
      for (const userId of recipientIds) {
        await query(
          `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
           VALUES ($1, $2, 'Order reminder', $3, 'order_reminder')`,
          [userId, order.location_id, `Order #${order.id} for ${order.customer_name} is due in ${daysLeft} day(s).`]
        );
      }
    }

    if (daysLeft < 0 && order.status !== 'overdue') {
      await query('UPDATE customer_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['overdue', order.id]);
      const recipientIds = [...new Set([...(order.manager_ids || []), order.cashier_id].filter(Boolean))];
      for (const userId of recipientIds) {
        await query(
          `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
           VALUES ($1, $2, 'Order overdue', $3, 'order_overdue')`,
          [userId, order.location_id, `Order #${order.id} for ${order.customer_name} is overdue.`]
        );
      }
    }
  }
}

export default router;
