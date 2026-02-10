import express from 'express';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Daily summary report
router.get('/daily', authenticateToken, async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    // Sales summary
    const salesResult = await query(
      `SELECT 
         COUNT(*) as total_transactions,
         SUM(total_amount) as total_sales,
         AVG(total_amount) as avg_transaction
       FROM sales
       WHERE location_id = $1 AND DATE(sale_date) = $2`,
      [locationId, date]
    );

    // Top products
    const topProductsResult = await query(
      `SELECT p.name, p.unit, 
              SUM(si.quantity) as total_sold,
              SUM(si.subtotal) as revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.location_id = $1 AND DATE(s.sale_date) = $2
       GROUP BY p.id, p.name, p.unit
       ORDER BY revenue DESC
       LIMIT 10`,
      [locationId, date]
    );

    // Expenses summary
    const expensesResult = await query(
      `SELECT 
         COUNT(*) as expense_count,
         SUM(amount) as total_expenses
       FROM expenses
       WHERE location_id = $1 AND expense_date = $2`,
      [locationId, date]
    );

    // Payment methods breakdown
    const paymentMethodsResult = await query(
      `SELECT 
         payment_method,
         COUNT(*) as count,
         SUM(total_amount) as total
       FROM sales
       WHERE location_id = $1 AND DATE(sale_date) = $2
       GROUP BY payment_method`,
      [locationId, date]
    );

    const sales = salesResult.rows[0];
    const expenses = expensesResult.rows[0];
    const grossProfit = (parseFloat(sales.total_sales) || 0) - (parseFloat(expenses.total_expenses) || 0);

    res.json({
      date,
      sales: {
        total_transactions: parseInt(sales.total_transactions) || 0,
        total_sales: parseFloat(sales.total_sales) || 0,
        avg_transaction: parseFloat(sales.avg_transaction) || 0
      },
      expenses: {
        expense_count: parseInt(expenses.expense_count) || 0,
        total_expenses: parseFloat(expenses.total_expenses) || 0
      },
      profit: {
        gross_profit: grossProfit
      },
      top_products: topProductsResult.rows,
      payment_methods: paymentMethodsResult.rows
    });
  } catch (err) {
    console.error('Daily report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Weekly summary report
router.get('/weekly', authenticateToken, async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
    const endDate = req.query.end_date || new Date().toISOString().split('T')[0];

    let startDate = req.query.start_date;
    if (!startDate) {
      const startDateObj = new Date(endDate);
      startDateObj.setDate(startDateObj.getDate() - 7);
      startDate = startDateObj.toISOString().split('T')[0];
    }

    // Sales by day
    const salesByDayResult = await query(
      `SELECT 
         DATE(sale_date) as date,
         COUNT(*) as transactions,
         SUM(total_amount) as total_sales
       FROM sales
       WHERE location_id = $1 AND DATE(sale_date) BETWEEN $2 AND $3
       GROUP BY DATE(sale_date)
       ORDER BY date`,
      [locationId, startDate, endDate]
    );

    // Total sales and expenses
    const totalsResult = await query(
      `SELECT 
         (SELECT COALESCE(SUM(total_amount), 0) FROM sales 
          WHERE location_id = $1 AND DATE(sale_date) BETWEEN $2 AND $3) as total_sales,
         (SELECT COALESCE(SUM(amount), 0) FROM expenses 
          WHERE location_id = $1 AND expense_date BETWEEN $2 AND $3) as total_expenses`,
      [locationId, startDate, endDate]
    );

    const totals = totalsResult.rows[0];
    const netProfit = parseFloat(totals.total_sales) - parseFloat(totals.total_expenses);

    // Top products for the week
    const topProductsResult = await query(
      `SELECT p.name, 
              SUM(si.quantity) as total_sold,
              SUM(si.subtotal) as revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.location_id = $1 AND DATE(s.sale_date) BETWEEN $2 AND $3
       GROUP BY p.id, p.name
       ORDER BY revenue DESC
       LIMIT 10`,
      [locationId, startDate, endDate]
    );

    res.json({
      period: { start_date: startDate, end_date: endDate },
      summary: {
        total_sales: parseFloat(totals.total_sales),
        total_expenses: parseFloat(totals.total_expenses),
        net_profit: netProfit
      },
      sales_by_day: salesByDayResult.rows,
      top_products: topProductsResult.rows
    });
  } catch (err) {
    console.error('Weekly report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Monthly summary report
router.get('/monthly', authenticateToken, async (req, res) => {
  try {
    const locationId = req.user.location_id || req.query.location_id;
    const year = req.query.year || new Date().getFullYear();
    const month = req.query.month || (new Date().getMonth() + 1);

    // Sales summary
    const salesResult = await query(
      `SELECT 
         COUNT(*) as total_transactions,
         SUM(total_amount) as total_sales,
         AVG(total_amount) as avg_transaction
       FROM sales
       WHERE location_id = $1 
         AND EXTRACT(YEAR FROM sale_date) = $2
         AND EXTRACT(MONTH FROM sale_date) = $3`,
      [locationId, year, month]
    );

    // Expenses by category
    const expensesByCategoryResult = await query(
      `SELECT 
         category,
         SUM(amount) as total,
         COUNT(*) as count
       FROM expenses
       WHERE location_id = $1 
         AND EXTRACT(YEAR FROM expense_date) = $2
         AND EXTRACT(MONTH FROM expense_date) = $3
       GROUP BY category
       ORDER BY total DESC`,
      [locationId, year, month]
    );

    // Staff payments
    const staffPaymentsResult = await query(
      `SELECT 
         SUM(amount) as total_staff_payments
       FROM staff_payments
       WHERE location_id = $1 
         AND EXTRACT(YEAR FROM payment_date) = $2
         AND EXTRACT(MONTH FROM payment_date) = $3`,
      [locationId, year, month]
    );

    // Top products
    const topProductsResult = await query(
      `SELECT p.name, 
              SUM(si.quantity) as total_sold,
              SUM(si.subtotal) as revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.location_id = $1 
         AND EXTRACT(YEAR FROM s.sale_date) = $2
         AND EXTRACT(MONTH FROM s.sale_date) = $3
       GROUP BY p.id, p.name
       ORDER BY revenue DESC
       LIMIT 15`,
      [locationId, year, month]
    );

    const sales = salesResult.rows[0];
    const totalExpenses = expensesByCategoryResult.rows.reduce((sum, row) => sum + parseFloat(row.total), 0);
    const totalStaffPayments = parseFloat(staffPaymentsResult.rows[0].total_staff_payments) || 0;
    const totalCosts = totalExpenses + totalStaffPayments;
    const netProfit = (parseFloat(sales.total_sales) || 0) - totalCosts;

    res.json({
      period: { year: parseInt(year), month: parseInt(month) },
      sales: {
        total_transactions: parseInt(sales.total_transactions) || 0,
        total_sales: parseFloat(sales.total_sales) || 0,
        avg_transaction: parseFloat(sales.avg_transaction) || 0
      },
      costs: {
        total_expenses: totalExpenses,
        total_staff_payments: totalStaffPayments,
        total_costs: totalCosts
      },
      profit: {
        net_profit: netProfit,
        margin_percent: sales.total_sales > 0 ? (netProfit / sales.total_sales * 100).toFixed(2) : 0
      },
      expenses_by_category: expensesByCategoryResult.rows,
      top_products: topProductsResult.rows
    });
  } catch (err) {
    console.error('Monthly report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Product profitability analysis
router.get('/products/profitability', 
  authenticateToken, 
  authorizeRoles('admin'), 
  async (req, res) => {
    try {
      const locationId = req.user.location_id || req.query.location_id;
      const startDate = req.query.start_date;
      const endDate = req.query.end_date;

      let queryText = `
        SELECT 
          p.id,
          p.name,
          p.price,
          p.cost,
          SUM(si.quantity) as units_sold,
          SUM(si.subtotal) as total_revenue,
          SUM(si.quantity * COALESCE(p.cost, 0)) as total_cost,
          SUM(si.subtotal - (si.quantity * COALESCE(p.cost, 0))) as gross_profit,
          CASE 
            WHEN SUM(si.subtotal) > 0 
            THEN ((SUM(si.subtotal - (si.quantity * COALESCE(p.cost, 0))) / SUM(si.subtotal)) * 100)
            ELSE 0 
          END as margin_percent
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.location_id = $1
      `;

      const params = [locationId];

      if (startDate) {
        params.push(startDate);
        queryText += ` AND DATE(s.sale_date) >= $${params.length}`;
      }

      if (endDate) {
        params.push(endDate);
        queryText += ` AND DATE(s.sale_date) <= $${params.length}`;
      }

      queryText += `
        GROUP BY p.id, p.name, p.price, p.cost
        ORDER BY gross_profit DESC
      `;

      const result = await query(queryText, params);
      res.json(result.rows);
    } catch (err) {
      console.error('Product profitability error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
