import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Calendar,
  DollarSign,
  Wallet,
  Users,
  Receipt,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useLanguage } from '../../context/LanguageContext';
import './Dashboard.css';

const formatMoney = (value) => `ETB ${Number(value || 0).toFixed(2)}`;
const formatShortDate = (value) => new Date(value).toLocaleDateString();

export default function Dashboard() {
  const { selectedLocationId } = useBranch();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [period, setPeriod] = useState('daily');
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [weekEndDate, setWeekEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [monthValue, setMonthValue] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);

  const [report, setReport] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [branchSummary, setBranchSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadReport = async () => {
      if (user?.role === 'admin' && !selectedLocationId) {
        setReport(null);
        setKpis(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        let reportRes;
        if (period === 'daily') {
          reportRes = await api.get(`/reports/daily?date=${dailyDate}`);
        } else if (period === 'weekly') {
          reportRes = await api.get(`/reports/weekly?end_date=${weekEndDate}`);
        } else {
          const [year, month] = monthValue.split('-');
          reportRes = await api.get(`/reports/monthly?year=${year}&month=${Number(month)}`);
        }
        setReport(reportRes.data || null);

        if (user?.role === 'admin') {
          const [kpiRes, branchRes] = await Promise.all([
            api.get('/reports/kpis'),
            api.get('/reports/branches/summary'),
          ]);
          setKpis(kpiRes.data || null);
          setBranchSummary(branchRes.data || []);
        } else {
          setKpis(null);
          setBranchSummary([]);
        }
      } catch (err) {
        setError(err?.response?.data?.error || err?.message || 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [period, dailyDate, weekEndDate, monthValue, selectedLocationId, user?.role]);

  const totals = useMemo(() => {
    if (!report) {
      return {
        revenue: 0,
        transactions: 0,
        expenses: 0,
        staffPayments: 0,
        batchCosts: 0,
        totalCosts: 0,
        netProfit: 0,
      };
    }

    if (period === 'daily') {
      const revenue = Number(report.sales?.total_sales || 0);
      const transactions = Number(report.sales?.total_transactions || 0);
      const expenses = Number(report.expenses?.total_expenses || 0);
      const staffPayments = Number(report.staff_payments?.total_staff_payments || 0);
      const batchCosts = Number(report.profit?.batch_costs || report.details?.batches?.total_batch_cost || 0);
      const totalCosts = Number(report.profit?.total_costs || expenses + staffPayments + batchCosts);
      const netProfit = Number(report.profit?.net_profit || revenue - totalCosts);
      return { revenue, transactions, expenses, staffPayments, batchCosts, totalCosts, netProfit };
    }

    if (period === 'weekly') {
      const revenue = Number(report.summary?.total_sales || 0);
      const transactions = Number(report.summary?.total_transactions || 0);
      const expenses = Number(report.summary?.total_expenses || 0);
      const staffPayments = Number(report.summary?.total_staff_payments || 0);
      const batchCosts = Number(report.summary?.total_batch_costs || report.details?.batches?.total_batch_cost || 0);
      const totalCosts = Number(report.summary?.total_costs || expenses + staffPayments + batchCosts);
      const netProfit = Number(report.summary?.net_profit || revenue - totalCosts);
      return { revenue, transactions, expenses, staffPayments, batchCosts, totalCosts, netProfit };
    }

    const revenue = Number(report.sales?.total_sales || 0);
    const transactions = Number(report.sales?.total_transactions || 0);
    const expenses = Number(report.expenses?.total_expenses || 0);
    const staffPayments = Number(report.staff_payments?.total_staff_payments || 0);
    const batchCosts = Number(report.costs?.batch_costs || report.details?.batches?.total_batch_cost || 0);
    const totalCosts = Number(report.costs?.total_costs || expenses + staffPayments + batchCosts);
    const netProfit = Number(report.profit?.net_profit || revenue - totalCosts);
    return { revenue, transactions, expenses, staffPayments, batchCosts, totalCosts, netProfit };
  }, [report, period]);

  const topProducts = report?.top_products || [];
  const paymentMethods = report?.payment_methods || [];
  const orderSummary = period === 'weekly' ? report?.summary?.orders : report?.orders;
  const expenseRows = report?.details?.expenses || [];
  const staffPaymentRows = report?.details?.staff_payments || [];
  const cashierRows = report?.details?.cashier_performance || [];
  const batchRows = report?.details?.batches?.batch_list || [];

  const periodLabel = period === 'daily'
    ? formatShortDate(dailyDate)
    : period === 'weekly'
      ? `${formatShortDate(report?.period?.start_date || weekEndDate)} - ${formatShortDate(report?.period?.end_date || weekEndDate)}`
      : new Date(`${monthValue}-01`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  if (user?.role === 'admin' && !selectedLocationId) {
    return (
      <div className="dashboard-page">
        <div className="card"><div className="card-body">Select a branch from the top bar to load live dashboard data.</div></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="card"><div className="card-body text-danger">{error}</div></div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h2>{t('dashboard')}</h2>
        <p className="dashboard-date">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="card"><div className="card-body controls-wrap">
        <div className="d-flex align-items-center gap-2"><Calendar size={16} /><strong>Period:</strong></div>
        <div className="btn-group">
          <button className={`btn btn-sm ${period === 'daily' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setPeriod('daily')}>Daily</button>
          <button className={`btn btn-sm ${period === 'weekly' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setPeriod('weekly')}>Weekly</button>
          <button className={`btn btn-sm ${period === 'monthly' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setPeriod('monthly')}>Monthly</button>
        </div>
        {period === 'daily' && <input type="date" className="form-control form-control-sm date-input" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} />}
        {period === 'weekly' && <input type="date" className="form-control form-control-sm date-input" value={weekEndDate} onChange={(e) => setWeekEndDate(e.target.value)} />}
        {period === 'monthly' && <input type="month" className="form-control form-control-sm date-input" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />}
      </div></div>

      <div className="period-chip">{periodLabel}</div>

      <div className="stats-grid">
        <StatCard icon={<DollarSign size={18} />} label={`${period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'} Sales`} value={formatMoney(totals.revenue)} sub={`${totals.transactions} transactions`} />
        <StatCard icon={<Receipt size={18} />} label={`${period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'} Expenses`} value={formatMoney(totals.expenses)} sub={`${expenseRows.length} expense entries`} />
        <StatCard icon={<Users size={18} />} label="Staff Payments" value={formatMoney(totals.staffPayments)} sub={`${staffPaymentRows.length} payments`} />
        <StatCard icon={<Wallet size={18} />} label="Net Profit" value={formatMoney(totals.netProfit)} sub="Revenue - all costs" tone={totals.netProfit >= 0 ? 'success' : 'danger'} />
      </div>

      <div className="details-grid">
        <div className="card">
          <div className="card-header"><h3>Top Products</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {topProducts.slice(0, 8).map((_, idx) => <Cell key={idx} fill={idx === 0 ? '#2563eb' : '#93c5fd'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Payment Methods ({period === 'daily' ? 'Today' : 'Selected period'})</h3></div>
          <div className="card-body payment-methods">
            {paymentMethods.map((row, idx) => (
              <div className="payment-method-item" key={`${row.payment_method}-${idx}`}>
                <div>
                  <div className="payment-method-label">{row.payment_method}</div>
                  <div className="stat-subtext">{Number(row.count || 0)} sales</div>
                </div>
                <div className="payment-amount">{formatMoney(row.total)}</div>
              </div>
            ))}
            {!paymentMethods.length && <div className="stat-subtext">No payment records in this period.</div>}
          </div>
        </div>
      </div>

      <DataTable title="Products Sold" headers={['Product', 'Units', 'Revenue']} rows={topProducts.map((r) => [r.name, Number(r.total_sold || 0), formatMoney(r.revenue)])} empty="No products sold in this period." />

      <DataTable
        title="Cashier & Ground Manager Performance"
        headers={['Team Member', 'Role', 'Sales', 'Txns', 'Items', 'Cash', 'Mobile']}
        rows={cashierRows.map((r) => [r.cashier_name, r.cashier_role, formatMoney(r.total_sales), Number(r.transactions || 0), Number(r.items_sold || 0), formatMoney(r.cash_sales), formatMoney(r.mobile_sales)])}
        empty="No cashier performance data in this period."
      />

      <DataTable
        title="Batch Performance"
        headers={['Batch', 'Created By', 'Status', 'Product', 'Qty', 'Unit Cost', 'Line Cost', 'Offline']}
        rows={batchRows.map((r) => [`#${r.batch_id}`, r.created_by_name, r.status, r.product_name, Number(r.quantity || 0), formatMoney(r.unit_cost), formatMoney(r.line_cost), r.is_offline ? 'Yes' : 'No'])}
        empty="No batch records in this period."
      />

      <DataTable
        title="Expense Records"
        headers={['Date', 'Category', 'Amount', 'Created By']}
        rows={expenseRows.map((r) => [formatShortDate(r.expense_date), r.category, formatMoney(r.amount), r.created_by_name || '-'])}
        empty="No expense records in this period."
      />

      <DataTable
        title="Order Revenue Transparency"
        headers={['Metric', 'Value', 'Note']}
        rows={[
          ['Total Created Orders', Number(orderSummary?.total_created_orders || 0), 'All created orders in selected period'],
          ['Order Paid Revenue', formatMoney(orderSummary?.order_paid_revenue), 'Sum of upfront payments'],
          ['Order Outstanding', formatMoney(orderSummary?.order_outstanding), 'Open orders remaining balance'],
          ['Delivered Order Revenue', formatMoney(orderSummary?.delivered_order_revenue), 'Realized from delivered orders'],
        ]}
      />

      <DataTable
        title="Cost Components"
        headers={['Component', 'Amount', 'Transparency Note']}
        rows={[
          ['Total Revenue', formatMoney(totals.revenue), 'From completed sales in this period'],
          ['Batch Production Cost', formatMoney(totals.batchCosts), `${Number(report?.details?.batches?.batch_count || 0)} non-voided batches × product unit cost`],
          ['Manual Expenses', formatMoney(totals.expenses), 'Recorded expenses table entries'],
          ['Staff Payments', formatMoney(totals.staffPayments), 'Payroll and advances paid in period'],
          ['Net Profit', formatMoney(totals.netProfit), 'Revenue - all costs above'],
        ]}
      />

      {!!branchSummary.length && (
        <DataTable
          title="Multi-Branch Snapshot (Today)"
          headers={['Branch', 'Sales', 'Transactions', 'Expenses', 'Staff Payments', 'Net']}
          rows={branchSummary.map((r) => [r.location_name, formatMoney(r.today_sales), Number(r.today_transactions || 0), formatMoney(r.today_expenses), formatMoney(r.today_staff_payments), formatMoney(r.today_net)])}
        />
      )}

      <div className="card">
        <div className="card-header"><h3>{period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'} Summary</h3></div>
        <div className="card-body summary-list">
          <SummaryItem label="Total Revenue" value={formatMoney(totals.revenue)} />
          <SummaryItem label="Total Expenses" value={formatMoney(totals.expenses)} />
          <SummaryItem label="Total Staff Payments" value={formatMoney(totals.staffPayments)} />
          <SummaryItem label="Total Costs" value={formatMoney(totals.totalCosts)} />
          <SummaryItem label="Net Profit" value={formatMoney(totals.netProfit)} bold />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, tone = 'primary', compact = false }) {
  return (
    <div className={`stat-card card ${compact ? 'stat-card-compact' : ''}`}>
      <div className={`stat-icon tone-${tone}`}><span>{icon}</span></div>
      <div className="stat-content">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub ? <div className="stat-subtext">{sub}</div> : null}
      </div>
    </div>
  );
}

function DataTable({ title, headers, rows, empty }) {
  return (
    <div className="card">
      <div className="card-header"><h3>{title}</h3></div>
      <div className="card-body table-responsive">
        <table className="table transparency-table">
          <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows?.length ? rows.map((row, i) => <tr key={`${title}-${i}`}>{row.map((cell, ci) => <td key={`${title}-${i}-${ci}`}>{cell}</td>)}</tr>) : (
              <tr><td colSpan={headers.length} className="text-center text-muted">{empty || 'No records in this period.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, bold = false }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong className={bold ? '' : 'summary-normal'}>{value}</strong>
    </div>
  );
}
