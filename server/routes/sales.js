import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Create sale
router.post('/',
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

    const { items, payment_method } = req.body;
    const locationId = req.user.location_id;
    const cashierId = req.user.id;

    try {
      const sale = await withTransaction(async (tx) => {
        let totalAmount = 0;
        const saleItems = [];

        for (const item of items) {
          const productResult = await tx.query(
            'SELECT id, name, price FROM products WHERE id = $1',
            [item.product_id]
          );

          if (productResult.rows.length === 0) {
            const notFoundError = new Error(`Product ${item.product_id} not found`);
            notFoundError.status = 404;
            throw notFoundError;
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
            subtotal
          });
        }

        const receiptNumber = `RCP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const saleResult = await tx.query(
          `INSERT INTO sales (location_id, cashier_id, total_amount, payment_method, receipt_number)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [locationId, cashierId, totalAmount, payment_method || 'cash', receiptNumber]
        );

        const createdSale = saleResult.rows[0];

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

          if (remainingQty < 5) {
            await tx.query(
              `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
               SELECT id, $1, $2, $3, $4 FROM users WHERE role IN ('admin', 'manager') AND location_id = $1`,
              [
                locationId,
                'Low Stock Alert',
                `${item.product_name} is running low (${remainingQty} remaining)`,
                'low_stock'
              ]
            );
          }
        }

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            cashierId,
            locationId,
            'sale_created',
            `Sale ${receiptNumber} - Total: ${totalAmount}`,
            JSON.stringify({ sale_id: createdSale.id, receipt_number: receiptNumber, items_count: items.length })
          ]
        );

        return createdSale;
      });

      // Fetch complete sale with items
      const completeSale = await getSaleWithItems(sale.id);
      res.status(201).json(completeSale);
    } catch (err) {
      console.error('Create sale error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
    }
  }
);

// Get sales history
router.get('/', authenticateToken, async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
    const limit = parseInt(req.query.limit) || 100;
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single sale with items
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

// Helper function to get sale with items
async function getSaleWithItems(saleId) {
  const saleResult = await query(
    `SELECT s.*, u.username as cashier_name
     FROM sales s
     JOIN users u ON s.cashier_id = u.id
     WHERE s.id = $1`,
    [saleId]
  );

  if (saleResult.rows.length === 0) {
    return null;
  }

  const itemsResult = await query(
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
