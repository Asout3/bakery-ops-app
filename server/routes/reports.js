import express from 'express';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();

// Daily summary report
router.get('/daily', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const date = req.query.date || new Date().toISOString().split('T')[0];

    if (req.user?.role === 'admin') {
      await query(
        `INSERT INTO kpi_events (location_id, user_id, event_type, metric_key, event_value, metadata)
         VALUES ($1, $2, 'report_viewed', 'owner_report_usage', 1, $3)`,
        [locationId, req.user.id, JSON.stringify({ report: 'daily' })]
      );
    }

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
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// Weekly summary report
router.get('/weekly', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const endDate = req.query.end_date || new Date().toISOString().split('T')[0];

    if (req.user?.role === 'admin') {
      await query(
        `INSERT INTO kpi_events (location_id, user_id, event_type, metric_key, event_value, metadata)
         VALUES ($1, $2, 'report_viewed', 'owner_report_usage', 1, $3)`,
        [locationId, req.user.id, JSON.stringify({ report: 'weekly' })]
      );
    }

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

    const categoryResult = await query(
      `SELECT c.name as category,
              SUM(si.subtotal) as revenue,
              SUM(si.quantity) as units_sold
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE s.location_id = $1 AND DATE(s.sale_date) BETWEEN $2 AND $3
       GROUP BY c.name
       ORDER BY revenue DESC`,
      [locationId, startDate, endDate]
    );

    const paymentMethodsResult = await query(
      `SELECT payment_method, COUNT(*) as count, SUM(total_amount) as total
       FROM sales
       WHERE location_id = $1 AND DATE(sale_date) BETWEEN $2 AND $3
       GROUP BY payment_method
       ORDER BY total DESC`,
      [locationId, startDate, endDate]
    );

    const transactions = salesByDayResult.rows.reduce((acc, row) => acc + Number(row.transactions || 0), 0);

    res.json({
      period: { start_date: startDate, end_date: endDate },
      summary: {
        total_sales: parseFloat(totals.total_sales),
        total_expenses: parseFloat(totals.total_expenses),
        net_profit: netProfit,
        total_transactions: transactions,
        avg_transaction: transactions > 0 ? parseFloat(totals.total_sales) / transactions : 0,
      },
      sales_by_day: salesByDayResult.rows,
      sales_by_category: categoryResult.rows,
      payment_methods: paymentMethodsResult.rows,
      top_products: topProductsResult.rows
    });
  } catch (err) {
    console.error('Weekly report error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});


// Weekly summary CSV export
router.get('/weekly/export', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const endDate = req.query.end_date || new Date().toISOString().split('T')[0];

    if (req.user?.role === 'admin') {
      await query(
        `INSERT INTO kpi_events (location_id, user_id, event_type, metric_key, event_value, metadata)
         VALUES ($1, $2, 'report_viewed', 'owner_report_usage', 1, $3)`,
        [locationId, req.user.id, JSON.stringify({ report: 'weekly' })]
      );
    }
    let startDate = req.query.start_date;
    if (!startDate) {
      const startDateObj = new Date(endDate);
      startDateObj.setDate(startDateObj.getDate() - 7);
      startDate = startDateObj.toISOString().split('T')[0];
    }

    const result = await query(
      `SELECT DATE(s.sale_date) as sale_date, p.name as product_name, c.name as category,
              si.quantity, si.unit_price, si.subtotal, s.payment_method, s.receipt_number
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE s.location_id = $1 AND DATE(s.sale_date) BETWEEN $2 AND $3
       ORDER BY s.sale_date DESC`,
      [locationId, startDate, endDate]
    );

    const headers = ['sale_date','product_name','category','quantity','unit_price','subtotal','payment_method','receipt_number'];
    const rows = result.rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=weekly-report-${startDate}-to-${endDate}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('Weekly export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Monthly summary report
router.get('/monthly', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const year = req.query.year || new Date().getFullYear();

    if (req.user?.role === 'admin') {
      await query(
        `INSERT INTO kpi_events (location_id, user_id, event_type, metric_key, event_value, metadata)
         VALUES ($1, $2, 'report_viewed', 'owner_report_usage', 1, $3)`,
        [locationId, req.user.id, JSON.stringify({ report: 'monthly' })]
      );
    }
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
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});


// Multi-branch summary (admin)
router.get('/branches/summary', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT l.id as location_id, l.name as location_name,
              COALESCE(SUM(CASE WHEN DATE(s.sale_date) = CURRENT_DATE THEN s.total_amount ELSE 0 END), 0) as today_sales,
              COALESCE(COUNT(CASE WHEN DATE(s.sale_date) = CURRENT_DATE THEN s.id END), 0) as today_transactions,
              COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.location_id = l.id AND e.expense_date = CURRENT_DATE), 0) as today_expenses
       FROM locations l
       LEFT JOIN sales s ON s.location_id = l.id
       WHERE l.is_active = true
       GROUP BY l.id, l.name
       ORDER BY l.name`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Branch summary error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});


// KPI summary mapped to success criteria
router.get('/kpis', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);

    const cashierTiming = await query(
      `SELECT COALESCE(AVG(duration_ms), 0) as avg_order_ms
       FROM kpi_events
       WHERE location_id = $1 AND metric_key = 'cashier_order_processing_time' AND duration_ms IS NOT NULL
         AND created_at >= CURRENT_DATE - INTERVAL '30 days'`,
      [locationId]
    );

    const ownerUsage = await query(
      `SELECT COALESCE(COUNT(*), 0) as weekly_views
       FROM kpi_events
       WHERE location_id = $1 AND metric_key = 'owner_report_usage' AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
      [locationId]
    );

    const retryMetric = await query(
      `SELECT COALESCE(AVG((metadata->>'retry_count')::numeric), 0) as avg_batch_retries,
              COALESCE(SUM(CASE WHEN (metadata->>'retry_count')::int = 0 THEN 1 ELSE 0 END), 0) as zero_retry_batches,
              COALESCE(COUNT(*), 0) as total_batches
       FROM kpi_events
       WHERE location_id = $1 AND metric_key = 'batch_retry_count' AND created_at >= CURRENT_DATE - INTERVAL '30 days'`,
      [locationId]
    );

    const retry = retryMetric.rows[0];
    const totalBatches = Number(retry.total_batches || 0);
    const zeroRetryBatches = Number(retry.zero_retry_batches || 0);

    res.json({
      avg_cashier_order_seconds: Number(cashierTiming.rows[0].avg_order_ms || 0) / 1000,
      owner_report_views_weekly: Number(ownerUsage.rows[0].weekly_views || 0),
      batch_zero_retry_rate_percent: totalBatches > 0 ? (zeroRetryBatches / totalBatches) * 100 : 0,
      avg_batch_retries: Number(retry.avg_batch_retries || 0),
      goals: {
        cashier_order_target_seconds: 20,
        owner_views_target_weekly: 5,
        batch_zero_retry_target_percent: 80
      }
    });
  } catch (err) {
    console.error('KPI summary error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// Product profitability analysis
router.get('/products/profitability', 
  authenticateToken, 
  authorizeRoles('admin'), 
  async (req, res) => {
    try {
      const locationId = await getTargetLocationId(req, query);
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
