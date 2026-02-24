import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { TrendingUp, TrendingDown, DollarSign, Calendar, Package, Wallet, Users } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import './Dashboard.css';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

const formatMoney = (value) => `ETB ${Number(value || 0).toFixed(2)}`;

export default function Dashboard() {
  const { selectedLocationId } = useBranch();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [period, setPeriod] = useState('daily');
  const [dailyReport, setDailyReport] = useState(null);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const fetchReports = async () => {
      if (user?.role === 'admin' && !selectedLocationId) {
        setLoading(false);
        setDailyReport(null);
        setWeeklyReport(null);
        setMonthlyReport(null);
        return;
      }

      setLoading(true);
      try {
        if (period === 'daily') {
          const res = await api.get(`/reports/daily?date=${reportDate}`).catch(() => ({ data: null }));
          setDailyReport(res.data);
        } else if (period === 'weekly') {
          const res = await api.get('/reports/weekly').catch(() => ({ data: null }));
          setWeeklyReport(res.data);
        } else {
          const res = await api.get('/reports/monthly').catch(() => ({ data: null }));
          setMonthlyReport(res.data);
        }
        const kpiRes = await api.get('/reports/kpis').catch(() => ({ data: null }));
        setKpis(kpiRes.data);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [selectedLocationId, period, reportDate, user?.role]);

  const report = period === 'daily' ? dailyReport : period === 'weekly' ? weeklyReport : monthlyReport;

  const salesRows = report?.top_products || [];
  const salesRevenueTotal = salesRows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const salesQtyTotal = salesRows.reduce((sum, row) => sum + Number(row.total_sold || 0), 0);

  const batchRows = report?.details?.batches?.batch_list || [];
  const expenseRows = report?.details?.expenses || [];
  const paymentRows = report?.details?.staff_payments || [];
  const cashierRows = report?.details?.cashier_performance || [];

  const totals = useMemo(() => {
    if (!report) {
      return { sales: 0, expenses: 0, batchCosts: 0, staffPayments: 0, gross: 0, net: 0 };
    }

    if (period === 'daily') {
      return {
        sales: Number(report.sales?.total_sales || 0),
        expenses: Number(report.expenses?.total_expenses || 0),
        batchCosts: Number(report.details?.batches?.total_batch_cost || 0),
        staffPayments: Number(report.staff_payments?.total_staff_payments || 0),
        gross: Number(report.profit?.gross_profit || 0),
        net: Number(report.profit?.net_profit || 0),
      };
    }

    return {
      sales: Number(report.summary?.total_sales || report.sales?.total_sales || 0),
      expenses: Number(report.summary?.total_expenses || report.expenses?.total_expenses || 0),
      batchCosts: Number(report.summary?.total_batch_costs || report.details?.batches?.total_batch_cost || 0),
      staffPayments: Number(report.summary?.total_staff_payments || report.staff_payments?.total_staff_payments || 0),
      gross: Number(report.summary?.gross_profit || report.profit?.gross_profit || 0),
      net: Number(report.summary?.net_profit || report.profit?.net_profit || 0),
    };
  }, [report, period]);

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }


  if (user?.role === 'admin' && !selectedLocationId) {
    return (
      <div className="dashboard-page">
        <div className="card">
          <div className="card-body">
            <h3>Select a Branch</h3>
            <p className="text-muted mb-0">Choose a branch from the top bar to load real dashboard metrics.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h2>{t('dashboard')}</h2>
        <p className="dashboard-date">{new Date().toLocaleDateString()}</p>
      </div>

      <div className="card">
        <div className="card-body d-flex align-items-center gap-3 flex-wrap">
          <div className="d-flex align-items-center gap-2"><Calendar size={18} /><strong>Period:</strong></div>
          <div className="btn-group" role="group">
            <button className={`btn btn-sm ${period === 'daily' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setPeriod('daily')}>Daily</button>
            <button className={`btn btn-sm ${period === 'weekly' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setPeriod('weekly')}>Weekly</button>
            <button className={`btn btn-sm ${period === 'monthly' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setPeriod('monthly')}>Monthly</button>
          </div>
          {period === 'daily' && (
            <input type="date" className="form-control form-control-sm" style={{ width: 'auto' }} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card card"><div className="stat-icon" style={{ background: 'var(--primary)' }}><DollarSign color="white" /></div><div className="stat-content"><div className="stat-label">Sales Revenue</div><div className="stat-value">{formatMoney(totals.sales)}</div></div></div>
        <div className="stat-card card"><div className="stat-icon" style={{ background: 'var(--danger)' }}><TrendingDown color="white" /></div><div className="stat-content"><div className="stat-label">Operational Expenses</div><div className="stat-value">{formatMoney(totals.expenses)}</div></div></div>
        <div className="stat-card card"><div className="stat-icon" style={{ background: 'var(--warning)' }}><Package color="white" /></div><div className="stat-content"><div className="stat-label">Batch Cost Outflow</div><div className="stat-value">{formatMoney(totals.batchCosts)}</div></div></div>
        <div className="stat-card card"><div className="stat-icon" style={{ background: '#7c3aed' }}><Users color="white" /></div><div className="stat-content"><div className="stat-label">Staff Payments</div><div className="stat-value">{formatMoney(totals.staffPayments)}</div></div></div>
        <div className="stat-card card"><div className="stat-icon" style={{ background: 'var(--success)' }}><TrendingUp color="white" /></div><div className="stat-content"><div className="stat-label">Gross Profit</div><div className="stat-value">{formatMoney(totals.gross)}</div><div className="stat-subtext">Sales - Expenses</div></div></div>
        <div className="stat-card card"><div className="stat-icon" style={{ background: totals.net >= 0 ? 'var(--success)' : 'var(--danger)' }}><Wallet color="white" /></div><div className="stat-content"><div className="stat-label">Net Profit</div><div className="stat-value">{formatMoney(totals.net)}</div><div className="stat-subtext">Sales - Expenses - Batch Costs - Staff</div></div></div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Sales Transparency</h3></div>
        <div className="card-body table-responsive">
          <table className="table transparency-table">
            <thead><tr><th>Item</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
            <tbody>
              {salesRows.map((row, idx) => (
                <tr key={`${row.name}-${idx}`}>
                  <td>{row.name}</td>
                  <td>{Number(row.total_sold || 0)}</td>
                  <td>{formatMoney(row.revenue)}</td>
                </tr>
              ))}
              <tr className="table-light"><td><strong>Total</strong></td><td><strong>{salesQtyTotal}</strong></td><td><strong>{formatMoney(salesRevenueTotal)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Batch Cost Transparency</h3></div>
        <div className="card-body table-responsive">
          <table className="table transparency-table">
            <thead><tr><th>Batch</th><th>Created By</th><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Line Cost</th></tr></thead>
            <tbody>
              {batchRows.map((row, idx) => (
                <tr key={`${row.batch_id}-${row.product_id}-${idx}`}>
                  <td>#{row.batch_id}</td>
                  <td>{row.created_by_name}</td>
                  <td>{row.product_name}</td>
                  <td>{row.quantity}</td>
                  <td>{formatMoney(row.unit_cost)}</td>
                  <td>{formatMoney(row.line_cost)}</td>
                </tr>
              ))}
              <tr className="table-light"><td colSpan={5}><strong>Total Batch Cost</strong></td><td><strong>{formatMoney(report?.details?.batches?.total_batch_cost)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="details-grid">
        <div className="card">
          <div className="card-header"><h3>Expense Ledger</h3></div>
          <div className="card-body table-responsive">
            <table className="table transparency-table">
              <thead><tr><th>Category</th><th>Description</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                {expenseRows.map((row) => (
                  <tr key={`exp-${row.id}`}><td>{row.category}</td><td>{row.description || '-'}</td><td>{formatMoney(row.amount)}</td><td>{row.expense_date}</td></tr>
                ))}
                <tr className="table-light"><td colSpan={2}><strong>Total Expenses</strong></td><td colSpan={2}><strong>{formatMoney(totals.expenses)}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Employee Salary Payments</h3></div>
          <div className="card-body table-responsive">
            <table className="table transparency-table">
              <thead><tr><th>Employee</th><th>Type</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                {paymentRows.map((row) => (
                  <tr key={`pay-${row.id}`}><td>{row.staff_name || 'N/A'}</td><td>{row.payment_type || 'salary'}</td><td>{formatMoney(row.amount)}</td><td>{row.payment_date}</td></tr>
                ))}
                <tr className="table-light"><td colSpan={2}><strong>Total Staff Payments</strong></td><td colSpan={2}><strong>{formatMoney(totals.staffPayments)}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Cashier Performance (Cashier Accounts Only)</h3></div>
        <div className="card-body table-responsive">
          <table className="table transparency-table">
            <thead><tr><th>Cashier</th><th>Transactions</th><th>Voided</th><th>Offline Synced</th><th>Total Sales</th></tr></thead>
            <tbody>
              {cashierRows.map((row, idx) => (
                <tr key={`${row.cashier_id || idx}`}>
                  <td>{row.cashier_name}</td>
                  <td>{Number(row.transactions || 0)}</td>
                  <td>{Number(row.voided_transactions || 0)}</td>
                  <td>{Number(row.offline_synced_transactions || 0)}</td>
                  <td>{formatMoney(row.total_sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(period !== 'daily') && (
        <div className="card">
          <div className="card-header"><h3>Sales Trend</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={report?.sales_by_day || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Line type="monotone" dataKey="total_sales" stroke="var(--primary)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {kpis && (
        <div className="stats-grid">
          <div className="stat-card card"><div className="stat-content"><div className="stat-label">Cashier Avg Order Time</div><div className="stat-value">{Number(kpis.avg_cashier_order_seconds || 0).toFixed(1)}s</div></div></div>
          <div className="stat-card card"><div className="stat-content"><div className="stat-label">Batch Zero-Retry Rate</div><div className="stat-value">{Number(kpis.batch_zero_retry_rate_percent || 0).toFixed(1)}%</div></div></div>
          <div className="stat-card card"><div className="stat-content"><div className="stat-label">Owner Report Views (7d)</div><div className="stat-value">{Number(kpis.owner_report_views_weekly || 0)}</div></div></div>
        </div>
      )}
    </div>
  );
}
