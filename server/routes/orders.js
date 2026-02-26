import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();

const ORDER_STATUSES = ['pending', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled', 'overdue'];

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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    try {
      const locationId = await getTargetLocationId(req, query);
      const { customer_name, customer_phone, customer_note, order_details, pickup_at, total_amount, paid_amount, payment_method } = req.body;

      if (Number(paid_amount) > Number(total_amount)) {
        return res.status(400).json({ error: 'Paid amount cannot exceed total amount', code: 'INVALID_PAYMENT_SPLIT', requestId: req.requestId });
      }

      const result = await query(
        `INSERT INTO customer_orders
        (location_id, cashier_id, customer_name, customer_phone, customer_note, order_details, pickup_at, total_amount, paid_amount, payment_method, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
        RETURNING *`,
        [locationId, req.user.id, customer_name, customer_phone, customer_note || null, order_details, pickup_at, total_amount, paid_amount, payment_method]
      );

      await query(
        `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
         SELECT id, $1, 'New pickup order', $2, 'order_created'
         FROM users WHERE role = 'manager' AND location_id = $1 AND is_active = true`,
        [locationId, `New order for ${customer_name} is due on ${new Date(pickup_at).toLocaleString()}.`]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create order error:', err);
      res.status(500).json({ error: 'Internal server error', code: 'ORDER_CREATE_ERROR', requestId: req.requestId });
    }
  }
);

router.get('/', authenticateToken, authorizeRoles('cashier', 'admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const includeClosed = req.query.include_closed === 'true';

    const result = await query(
      `SELECT o.*, u.username AS cashier_name, gm.username AS baked_done_by_name
       FROM customer_orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       LEFT JOIN users gm ON gm.id = o.baked_done_by
       WHERE o.location_id = $1
         ${includeClosed ? '' : "AND o.status NOT IN ('delivered', 'cancelled')"}
       ORDER BY o.pickup_at ASC, o.created_at DESC`,
      [locationId]
    );

    res.json(result.rows.map((row) => ({ ...row, balance_due: Number(row.total_amount) - Number(row.paid_amount) })));
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'ORDER_FETCH_ERROR', requestId: req.requestId });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('cashier', 'admin', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const orderId = Number(req.params.id);
    const { customer_name, customer_phone, customer_note, order_details, pickup_at, total_amount, paid_amount, payment_method, status } = req.body;

    if (status && !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status', code: 'INVALID_ORDER_STATUS', requestId: req.requestId });
    }

    if (paid_amount !== undefined && total_amount !== undefined && Number(paid_amount) > Number(total_amount)) {
      return res.status(400).json({ error: 'Paid amount cannot exceed total amount', code: 'INVALID_PAYMENT_SPLIT', requestId: req.requestId });
    }

    const result = await query(
      `UPDATE customer_orders
       SET customer_name = COALESCE($1, customer_name),
           customer_phone = COALESCE($2, customer_phone),
           customer_note = COALESCE($3, customer_note),
           order_details = COALESCE($4, order_details),
           pickup_at = COALESCE($5, pickup_at),
           total_amount = COALESCE($6, total_amount),
           paid_amount = COALESCE($7, paid_amount),
           payment_method = COALESCE($8, payment_method),
           status = COALESCE($9, status),
           delivered_at = CASE WHEN COALESCE($9, status) = 'delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
           cancelled_at = CASE WHEN COALESCE($9, status) = 'cancelled' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
           cancelled_by = CASE WHEN COALESCE($9, status) = 'cancelled' THEN $10 ELSE cancelled_by END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND location_id = $12
       RETURNING *`,
      [customer_name, customer_phone, customer_note, order_details, pickup_at, total_amount, paid_amount, payment_method, status, req.user.id, orderId, locationId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Order not found', code: 'ORDER_NOT_FOUND', requestId: req.requestId });
    }

    res.json({ ...result.rows[0], balance_due: Number(result.rows[0].total_amount) - Number(result.rows[0].paid_amount) });
  } catch (err) {
    console.error('Update order error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'ORDER_UPDATE_ERROR', requestId: req.requestId });
  }
});

router.put('/:id/baked', authenticateToken, authorizeRoles('manager', 'admin'), async (req, res) => {
  try {
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
      return res.status(404).json({ error: 'Order not found', code: 'ORDER_NOT_FOUND', requestId: req.requestId });
    }

    const order = result.rows[0];
    await query(
      `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
       VALUES ($1, $2, 'Order baked', $3, 'order_baked')`,
      [order.cashier_id, locationId, `Order #${order.id} for ${order.customer_name} is now ready.`]
    );

    res.json({ ...order, balance_due: Number(order.total_amount) - Number(order.paid_amount) });
  } catch (err) {
    console.error('Mark order baked error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'ORDER_BAKED_ERROR', requestId: req.requestId });
  }
});

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
