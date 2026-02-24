import express from 'express';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

const router = express.Router();


async function getSalesColumnCapabilities(db) {
  const result = await db(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'sales'`
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  return {
    hasStatus: columns.has('status'),
    hasOfflineFlag: columns.has('is_offline'),
  };
}

router.get('/daily', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    if (!locationId) {
      return res.status(400).json({ error: 'Location context is required for reports.' });
    }
    const salesColumns = await getSalesColumnCapabilities(query);
    const voidedExpr = salesColumns.hasStatus ? "COALESCE(s.status, 'completed') = 'voided'" : "false";
    const offlineExpr = salesColumns.hasOfflineFlag ? 's.is_offline = true' : 'false';
    const date = req.query.date || new Date().toISOString().split('T')[0];

    if (req.user?.role === 'admin') {
      await query(
        `INSERT INTO kpi_events (location_id, user_id, event_type, metric_key, event_value, metadata)
         VALUES ($1, $2, 'report_viewed', 'owner_report_usage', 1, $3)`,
        [locationId, req.user.id, JSON.stringify({ report: 'daily' })]
      );
    }

    const salesResult = await query(
      `SELECT 
         COUNT(*) as total_transactions,
         SUM(total_amount) as total_sales,
         AVG(total_amount) as avg_transaction
       FROM sales
       WHERE location_id = $1 AND DATE(sale_date) = $2`,
      [locationId, date]
    );

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

    const expensesResult = await query(
      `SELECT 
         COUNT(*) as expense_count,
         SUM(amount) as total_expenses
       FROM expenses
       WHERE location_id = $1 AND expense_date = $2`,
      [locationId, date]
    );

    const staffPaymentsResult = await query(
      `SELECT 
         COUNT(*) as payment_count,
         SUM(amount) as total_staff_payments
       FROM staff_payments
       WHERE location_id = $1 AND payment_date = $2`,
      [locationId, date]
    );

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


    const cashierPerformanceResult = await query(
      `SELECT u.username as cashier_name,
              u.role as cashier_role,
              s.cashier_id,
              COUNT(*) as transactions,
              COALESCE(SUM(s.total_amount), 0) as total_sales,
              COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END), 0) as cash_sales,
              COALESCE(SUM(CASE WHEN s.payment_method = 'mobile' THEN s.total_amount ELSE 0 END), 0) as mobile_sales,
              COALESCE(SUM(si.quantity), 0) as items_sold,
              COALESCE(SUM(CASE WHEN ${voidedExpr} THEN 1 ELSE 0 END), 0) as voided_transactions,
              COALESCE(SUM(CASE WHEN ${offlineExpr} THEN 1 ELSE 0 END), 0) as offline_synced_transactions
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       LEFT JOIN sale_items si ON si.sale_id = s.id
       WHERE s.location_id = $1 AND DATE(s.sale_date) = $2
         AND u.is_active = true
         AND u.role = 'cashier'
       GROUP BY s.cashier_id, u.username, u.role
       ORDER BY total_sales DESC`,
      [locationId, date]
    );

    const expenseListResult = await query(
      `SELECT e.id, e.category, e.description, e.amount, e.expense_date, u.username as created_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.location_id = $1 AND e.expense_date = $2
       ORDER BY e.created_at DESC`,
      [locationId, date]
    );

    const batchCostResult = await query(
      `SELECT COALESCE(SUM(bi.quantity * COALESCE(p.cost, 0)), 0) as total_batch_cost,
              COUNT(DISTINCT b.id) as batch_count
       FROM inventory_batches b
       JOIN batch_items bi ON bi.batch_id = b.id
       JOIN products p ON p.id = bi.product_id
       WHERE b.location_id = $1 AND DATE(b.created_at) = $2 AND b.status <> 'voided'`,
      [locationId, date]
    );

    const batchDetailsResult = await query(
      `SELECT b.id as batch_id, b.status, b.created_at, b.is_offline,
              COALESCE(b.original_actor_name, u.username) as created_by_name,
              bi.product_id, p.name as product_name, bi.quantity, bi.source,
              COALESCE(p.cost, 0) as unit_cost,
              (bi.quantity * COALESCE(p.cost, 0)) as line_cost
       FROM inventory_batches b
       JOIN batch_items bi ON bi.batch_id = b.id
       JOIN products p ON p.id = bi.product_id
       JOIN users u ON u.id = b.created_by
       WHERE b.location_id = $1 AND DATE(b.created_at) = $2 AND b.status <> 'voided'
       ORDER BY b.created_at DESC, bi.id`,
      [locationId, date]
    );

    const staffPaymentListResult = await query(
      `SELECT sp.id, sp.amount, sp.payment_date, sp.payment_type,
              COALESCE(st.full_name, u.username) as staff_name,
              creator.username as created_by_name
       FROM staff_payments sp
       LEFT JOIN staff_profiles st ON st.id = sp.staff_profile_id
       LEFT JOIN users u ON u.id = sp.user_id
       LEFT JOIN users creator ON creator.id = sp.created_by
       WHERE sp.location_id = $1 AND sp.payment_date = $2
       ORDER BY sp.created_at DESC`,
      [locationId, date]
    );

    const sales = salesResult.rows[0];
    const expenses = expensesResult.rows[0];
    const staffPayments = staffPaymentsResult.rows[0];
    
    const totalRevenue = parseFloat(sales.total_sales) || 0;
    const totalExpenses = parseFloat(expenses.total_expenses) || 0;
    const totalStaffPayments = parseFloat(staffPayments.total_staff_payments) || 0;
    const totalBatchCosts = parseFloat(batchCostResult.rows[0]?.total_batch_cost || 0);
    const totalCosts = totalExpenses + totalStaffPayments + totalBatchCosts;
    const grossProfit = totalRevenue - totalExpenses;
    const netProfit = totalRevenue - totalCosts;

    res.json({
      date,
      sales: {
        total_transactions: parseInt(sales.total_transactions) || 0,
        total_sales: totalRevenue,
        avg_transaction: parseFloat(sales.avg_transaction) || 0
      },
      expenses: {
        expense_count: parseInt(expenses.expense_count) || 0,
        total_expenses: totalExpenses
      },
      staff_payments: {
        payment_count: parseInt(staffPayments.payment_count) || 0,
        total_staff_payments: totalStaffPayments
      },
      profit: {
        gross_profit: grossProfit,
        net_profit: netProfit,
        total_costs: totalCosts,
        batch_costs: totalBatchCosts
      },
      top_products: topProductsResult.rows,
      payment_methods: paymentMethodsResult.rows,
      details: {
        cashier_performance: cashierPerformanceResult.rows,
        expenses: expenseListResult.rows,
        staff_payments: staffPaymentListResult.rows,
        batches: {
          total_batch_cost: Number(batchCostResult.rows[0]?.total_batch_cost || 0),
          batch_count: Number(batchCostResult.rows[0]?.batch_count || 0),
          batch_list: batchDetailsResult.rows
        }
      }
    });
  } catch (err) {
    console.error('Daily report error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/weekly', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    if (!locationId) {
      return res.status(400).json({ error: 'Location context is required for reports.' });
    }
    const salesColumns = await getSalesColumnCapabilities(query);
    const voidedExpr = salesColumns.hasStatus ? "COALESCE(s.status, 'completed') = 'voided'" : "false";
    const offlineExpr = salesColumns.hasOfflineFlag ? 's.is_offline = true' : 'false';
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
      startDateObj.setDate(startDateObj.getDate() - 6);
      startDate = startDateObj.toISOString().split('T')[0];
    }

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

    const totalsResult = await query(
      `SELECT 
         (SELECT COALESCE(SUM(total_amount), 0) FROM sales 
          WHERE location_id = $1 AND DATE(sale_date) BETWEEN $2 AND $3) as total_sales,
         (SELECT COALESCE(SUM(amount), 0) FROM expenses 
          WHERE location_id = $1 AND expense_date BETWEEN $2 AND $3) as total_expenses,
         (SELECT COUNT(*) FROM expenses 
          WHERE location_id = $1 AND expense_date BETWEEN $2 AND $3) as expense_count,
         (SELECT COALESCE(SUM(amount), 0) FROM staff_payments 
          WHERE location_id = $1 AND payment_date BETWEEN $2 AND $3) as total_staff_payments,
         (SELECT COUNT(*) FROM staff_payments 
          WHERE location_id = $1 AND payment_date BETWEEN $2 AND $3) as staff_payment_count`,
      [locationId, startDate, endDate]
    );

    const totals = totalsResult.rows[0];
    const totalRevenue = parseFloat(totals.total_sales) || 0;
    const totalExpenses = parseFloat(totals.total_expenses) || 0;
    const totalStaffPayments = parseFloat(totals.total_staff_payments) || 0;
    const totalBatchCosts = parseFloat(batchCostResult.rows[0]?.total_batch_cost || 0);
    const totalCosts = totalExpenses + totalStaffPayments + totalBatchCosts;
    const grossProfit = totalRevenue - totalExpenses;
    const netProfit = totalRevenue - totalCosts;

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


    const cashierPerformanceResult = await query(
      `SELECT u.username as cashier_name,
              u.role as cashier_role,
              s.cashier_id,
              COUNT(*) as transactions,
              COALESCE(SUM(s.total_amount), 0) as total_sales,
              COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END), 0) as cash_sales,
              COALESCE(SUM(CASE WHEN s.payment_method = 'mobile' THEN s.total_amount ELSE 0 END), 0) as mobile_sales,
              COALESCE(SUM(si.quantity), 0) as items_sold,
              COALESCE(SUM(CASE WHEN ${voidedExpr} THEN 1 ELSE 0 END), 0) as voided_transactions,
              COALESCE(SUM(CASE WHEN ${offlineExpr} THEN 1 ELSE 0 END), 0) as offline_synced_transactions
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       LEFT JOIN sale_items si ON si.sale_id = s.id
       WHERE s.location_id = $1 AND DATE(s.sale_date) BETWEEN $2 AND $3
         AND u.is_active = true
         AND u.role = 'cashier'
       GROUP BY s.cashier_id, u.username, u.role
       ORDER BY total_sales DESC`,
      [locationId, startDate, endDate]
    );

    const batchCostResult = await query(
      `SELECT COALESCE(SUM(bi.quantity * COALESCE(p.cost, 0)), 0) as total_batch_cost,
              COUNT(DISTINCT b.id) as batch_count
       FROM inventory_batches b
       JOIN batch_items bi ON bi.batch_id = b.id
       JOIN products p ON p.id = bi.product_id
       WHERE b.location_id = $1 AND DATE(b.created_at) BETWEEN $2 AND $3 AND b.status <> 'voided'`,
      [locationId, startDate, endDate]
    );

    const batchDetailsResult = await query(
      `SELECT b.id as batch_id, b.status, b.created_at, b.is_offline,
              COALESCE(b.original_actor_name, u.username) as created_by_name,
              bi.product_id, p.name as product_name, bi.quantity, bi.source,
              COALESCE(p.cost, 0) as unit_cost,
              (bi.quantity * COALESCE(p.cost, 0)) as line_cost
       FROM inventory_batches b
       JOIN batch_items bi ON bi.batch_id = b.id
       JOIN products p ON p.id = bi.product_id
       JOIN users u ON u.id = b.created_by
       WHERE b.location_id = $1 AND DATE(b.created_at) BETWEEN $2 AND $3 AND b.status <> 'voided'
       ORDER BY b.created_at DESC, bi.id`,
      [locationId, startDate, endDate]
    );


    const expenseListResult = await query(
      `SELECT e.id, e.category, e.description, e.amount, e.expense_date,
              u.username as created_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.location_id = $1 AND e.expense_date BETWEEN $2 AND $3
       ORDER BY e.expense_date DESC, e.created_at DESC`,
      [locationId, startDate, endDate]
    );

    const staffPaymentListResult = await query(
      `SELECT sp.id, sp.amount, sp.payment_date, sp.payment_type,
              COALESCE(st.full_name, u.username) as staff_name,
              creator.username as created_by_name
       FROM staff_payments sp
       LEFT JOIN staff_profiles st ON st.id = sp.staff_profile_id
       LEFT JOIN users u ON u.id = sp.user_id
       LEFT JOIN users creator ON creator.id = sp.created_by
       WHERE sp.location_id = $1 AND sp.payment_date BETWEEN $2 AND $3
       ORDER BY sp.payment_date DESC, sp.created_at DESC`,
      [locationId, startDate, endDate]
    );

    const transactions = salesByDayResult.rows.reduce((acc, row) => acc + Number(row.transactions || 0), 0);


    res.json({
      period: { start_date: startDate, end_date: endDate },
      summary: {
        total_sales: totalRevenue,
        total_expenses: totalExpenses,
        total_staff_payments: totalStaffPayments,
        total_batch_costs: totalBatchCosts,
        total_costs: totalCosts,
        gross_profit: grossProfit,
        net_profit: netProfit,
        total_transactions: transactions,
        expense_count: parseInt(totals.expense_count) || 0,
        staff_payment_count: parseInt(totals.staff_payment_count) || 0,
        avg_transaction: transactions > 0 ? totalRevenue / transactions : 0,
      },
      sales_by_day: salesByDayResult.rows,
      sales_by_category: categoryResult.rows,
      payment_methods: paymentMethodsResult.rows,
      top_products: topProductsResult.rows,
      details: {
        cashier_performance: cashierPerformanceResult.rows,
        expenses: expenseListResult.rows,
        staff_payments: staffPaymentListResult.rows,
        batches: {
          total_batch_cost: Number(batchCostResult.rows[0]?.total_batch_cost || 0),
          batch_count: Number(batchCostResult.rows[0]?.batch_count || 0),
          batch_list: batchDetailsResult.rows
        }
      }
    });
  } catch (err) {
    console.error('Weekly report error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});


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
      startDateObj.setDate(startDateObj.getDate() - 6);
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

router.get('/monthly', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    if (!locationId) {
      return res.status(400).json({ error: 'Location context is required for reports.' });
    }
    const year = req.query.year || new Date().getFullYear();
    const month = req.query.month || (new Date().getMonth() + 1);

    if (req.user?.role === 'admin') {
      await query(
        `INSERT INTO kpi_events (location_id, user_id, event_type, metric_key, event_value, metadata)
         VALUES ($1, $2, 'report_viewed', 'owner_report_usage', 1, $3)`,
        [locationId, req.user.id, JSON.stringify({ report: 'monthly' })]
      );
    }

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

    const staffPaymentsResult = await query(
      `SELECT 
         COUNT(*) as payment_count,
         SUM(amount) as total_staff_payments
       FROM staff_payments
       WHERE location_id = $1 
         AND EXTRACT(YEAR FROM payment_date) = $2
         AND EXTRACT(MONTH FROM payment_date) = $3`,
      [locationId, year, month]
    );

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


    const paymentMethodsResult = await query(
      `SELECT payment_method, COUNT(*) as count, SUM(total_amount) as total
       FROM sales
       WHERE location_id = $1
         AND EXTRACT(YEAR FROM sale_date) = $2
         AND EXTRACT(MONTH FROM sale_date) = $3
       GROUP BY payment_method
       ORDER BY total DESC`,
      [locationId, year, month]
    );

    const cashierPerformanceResult = await query(
      `SELECT u.username as cashier_name,
              u.role as cashier_role,
              s.cashier_id,
              COUNT(*) as transactions,
              COALESCE(SUM(s.total_amount), 0) as total_sales,
              COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END), 0) as cash_sales,
              COALESCE(SUM(CASE WHEN s.payment_method = 'mobile' THEN s.total_amount ELSE 0 END), 0) as mobile_sales,
              COALESCE(SUM(si.quantity), 0) as items_sold,
              COALESCE(SUM(CASE WHEN ${voidedExpr} THEN 1 ELSE 0 END), 0) as voided_transactions,
              COALESCE(SUM(CASE WHEN ${offlineExpr} THEN 1 ELSE 0 END), 0) as offline_synced_transactions
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       LEFT JOIN sale_items si ON si.sale_id = s.id
       WHERE s.location_id = $1
         AND EXTRACT(YEAR FROM s.sale_date) = $2
         AND EXTRACT(MONTH FROM s.sale_date) = $3
         AND u.is_active = true
         AND u.role = 'cashier'
       GROUP BY s.cashier_id, u.username, u.role
       ORDER BY total_sales DESC`,
      [locationId, year, month]
    );

    const batchCostResult = await query(
      `SELECT COALESCE(SUM(bi.quantity * COALESCE(p.cost, 0)), 0) as total_batch_cost,
              COUNT(DISTINCT b.id) as batch_count
       FROM inventory_batches b
       JOIN batch_items bi ON bi.batch_id = b.id
       JOIN products p ON p.id = bi.product_id
       WHERE b.location_id = $1
         AND EXTRACT(YEAR FROM b.created_at) = $2
         AND EXTRACT(MONTH FROM b.created_at) = $3
         AND b.status <> 'voided'`,
      [locationId, year, month]
    );

    const batchDetailsResult = await query(
      `SELECT b.id as batch_id, b.status, b.created_at, b.is_offline,
              COALESCE(b.original_actor_name, u.username) as created_by_name,
              bi.product_id, p.name as product_name, bi.quantity, bi.source,
              COALESCE(p.cost, 0) as unit_cost,
              (bi.quantity * COALESCE(p.cost, 0)) as line_cost
       FROM inventory_batches b
       JOIN batch_items bi ON bi.batch_id = b.id
       JOIN products p ON p.id = bi.product_id
       JOIN users u ON u.id = b.created_by
       WHERE b.location_id = $1
         AND EXTRACT(YEAR FROM b.created_at) = $2
         AND EXTRACT(MONTH FROM b.created_at) = $3
         AND b.status <> 'voided'
       ORDER BY b.created_at DESC, bi.id`,
      [locationId, year, month]
    );

    const sales = salesResult.rows[0];
    const staffPayments = staffPaymentsResult.rows[0];
    const totalExpenses = expensesByCategoryResult.rows.reduce((sum, row) => sum + parseFloat(row.total), 0);
    const totalStaffPayments = parseFloat(staffPayments.total_staff_payments) || 0;
    const totalBatchCosts = parseFloat(batchCostResult.rows[0]?.total_batch_cost || 0);
    const totalCosts = totalExpenses + totalStaffPayments + totalBatchCosts;
    const totalRevenue = parseFloat(sales.total_sales) || 0;
    const grossProfit = totalRevenue - totalExpenses;
    const netProfit = totalRevenue - totalCosts;

    res.json({
      period: { year: parseInt(year), month: parseInt(month) },
      sales: {
        total_transactions: parseInt(sales.total_transactions) || 0,
        total_sales: totalRevenue,
        avg_transaction: parseFloat(sales.avg_transaction) || 0
      },
      expenses: {
        expense_count: expensesByCategoryResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
        total_expenses: totalExpenses,
        by_category: expensesByCategoryResult.rows
      },
      staff_payments: {
        payment_count: parseInt(staffPayments.payment_count) || 0,
        total_staff_payments: totalStaffPayments
      },
      costs: {
        total_costs: totalCosts,
        batch_costs: totalBatchCosts
      },
      profit: {
        gross_profit: grossProfit,
        net_profit: netProfit,
        total_costs: totalCosts,
        batch_costs: totalBatchCosts,
        margin_percent: totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(2) : 0
      },
      top_products: topProductsResult.rows,
      payment_methods: paymentMethodsResult.rows,
      details: {
        cashier_performance: cashierPerformanceResult.rows,
        expenses: expenseListResult.rows,
        staff_payments: staffPaymentListResult.rows,
        batches: {
          total_batch_cost: Number(batchCostResult.rows[0]?.total_batch_cost || 0),
          batch_count: Number(batchCostResult.rows[0]?.batch_count || 0),
          batch_list: batchDetailsResult.rows
        }
      }
    });
  } catch (err) {
    console.error('Monthly report error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});


router.get('/branches/summary', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT l.id as location_id, l.name as location_name,
              COALESCE(SUM(CASE WHEN DATE(s.sale_date) = CURRENT_DATE THEN s.total_amount ELSE 0 END), 0) as today_sales,
              COALESCE(COUNT(CASE WHEN DATE(s.sale_date) = CURRENT_DATE THEN s.id END), 0) as today_transactions,
              COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.location_id = l.id AND e.expense_date = CURRENT_DATE), 0) as today_expenses,
              COALESCE((SELECT SUM(sp.amount) FROM staff_payments sp WHERE sp.location_id = l.id AND sp.payment_date = CURRENT_DATE), 0) as today_staff_payments
       FROM locations l
       LEFT JOIN sales s ON s.location_id = l.id
       WHERE l.is_active = true
       GROUP BY l.id, l.name
       ORDER BY l.name`
    );

    res.json(result.rows.map(row => ({
      ...row,
      today_total_costs: parseFloat(row.today_expenses || 0) + parseFloat(row.today_staff_payments || 0),
      today_net: parseFloat(row.today_sales || 0) - parseFloat(row.today_expenses || 0) - parseFloat(row.today_staff_payments || 0)
    })));
  } catch (err) {
    console.error('Branch summary error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});


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
