import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { TrendingUp, TrendingDown, DollarSign, Users, Calendar, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import './Dashboard.css';
import { useLanguage } from '../../context/LanguageContext';

export default function Dashboard() {
  const { selectedLocationId } = useBranch();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('daily');
  const [dailyReport, setDailyReport] = useState(null);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [branchSummary, setBranchSummary] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchReports();
  }, [selectedLocationId, period, reportDate]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      if (period === 'daily') {
        const [daily, branches] = await Promise.all([
          api.get(`/reports/daily?date=${reportDate}`).catch(() => ({ data: null })),
          api.get('/reports/branches/summary').catch(() => ({ data: [] }))
        ]);
        setDailyReport(daily.data);
        setBranchSummary(branches.data || []);
      } else if (period === 'weekly') {
        const [weekly, branches] = await Promise.all([
          api.get('/reports/weekly').catch(() => ({ data: null })),
          api.get('/reports/branches/summary').catch(() => ({ data: [] }))
        ]);
        setWeeklyReport(weekly.data);
        setBranchSummary(branches.data || []);
      } else if (period === 'monthly') {
        const [monthly, branches] = await Promise.all([
          api.get('/reports/monthly').catch(() => ({ data: null })),
          api.get('/reports/branches/summary').catch(() => ({ data: [] }))
        ]);
        setMonthlyReport(monthly.data);
        setBranchSummary(branches.data || []);
      }
      
      const kpiRes = await api.get('/reports/kpis').catch(() => ({ data: null }));
      setKpis(kpiRes.data);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const getReportData = () => {
    if (period === 'daily') return dailyReport;
    if (period === 'weekly') return weeklyReport;
    if (period === 'monthly') return monthlyReport;
    return null;
  };

  const report = getReportData();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  const getStats = () => {
    if (period === 'daily' && report) {
      return [
        {
          title: 'Daily Sales',
          value: `ETB ${Number(report.sales?.total_sales || 0).toFixed(2)}`,
          icon: DollarSign,
          color: 'primary',
          subtext: `${report.sales?.total_transactions || 0} transactions`
        },
        {
          title: 'Daily Expenses',
          value: `ETB ${Number(report.expenses?.total_expenses || 0).toFixed(2)}`,
          icon: TrendingDown,
          color: 'danger',
          subtext: `${report.expenses?.expense_count || 0} expense entries`
        },
        {
          title: 'Batch Costs',
          value: `ETB ${Number(report.details?.batches?.total_batch_cost || 0).toFixed(2)}`,
          icon: Package,
          color: 'warning',
          subtext: `${report.details?.batches?.batch_count || 0} batches`
        },
        {
          title: 'Gross Profit',
          value: `ETB ${Number(report.profit?.gross_profit || 0).toFixed(2)}`,
          icon: TrendingUp,
          color: Number(report.profit?.gross_profit || 0) >= 0 ? 'success' : 'danger',
          subtext: 'Sales - Expenses'
        },
        {
          title: 'Net Profit',
          value: `ETB ${Number(report.profit?.net_profit || 0).toFixed(2)}`,
          icon: TrendingUp,
          color: Number(report.profit?.net_profit || 0) >= 0 ? 'success' : 'danger',
          subtext: 'Gross - Batch Costs - Staff'
        }
      ];
    }
    
    if (period === 'weekly' && report) {
      return [
        {
          title: 'Weekly Sales',
          value: `ETB ${Number(report.summary?.total_sales || 0).toFixed(2)}`,
          icon: DollarSign,
          color: 'primary',
          subtext: `${report.summary?.total_transactions || 0} transactions`
        },
        {
          title: 'Weekly Expenses',
          value: `ETB ${Number(report.summary?.total_expenses || 0).toFixed(2)}`,
          icon: TrendingDown,
          color: 'danger',
          subtext: `${report.summary?.expense_count || 0} expense entries`
        },
        {
          title: 'Batch Costs',
          value: `ETB ${Number(report.details?.batches?.total_batch_cost || 0).toFixed(2)}`,
          icon: Package,
          color: 'warning',
          subtext: `${report.details?.batches?.batch_count || 0} batches`
        },
        {
          title: 'Gross Profit',
          value: `ETB ${Number(report.summary?.gross_profit || 0).toFixed(2)}`,
          icon: TrendingUp,
          color: Number(report.summary?.gross_profit || 0) >= 0 ? 'success' : 'danger',
          subtext: 'Sales - Expenses'
        },
        {
          title: 'Net Profit',
          value: `ETB ${Number(report.summary?.net_profit || 0).toFixed(2)}`,
          icon: TrendingUp,
          color: Number(report.summary?.net_profit || 0) >= 0 ? 'success' : 'danger',
          subtext: 'Gross - Batch Costs - Staff'
        }
      ];
    }
    
    if (period === 'monthly' && report) {
      return [
        {
          title: 'Monthly Sales',
          value: `ETB ${Number(report.sales?.total_sales || 0).toFixed(2)}`,
          icon: DollarSign,
          color: 'primary',
          subtext: `${report.sales?.total_transactions || 0} transactions`
        },
        {
          title: 'Monthly Expenses',
          value: `ETB ${Number(report.expenses?.total_expenses || 0).toFixed(2)}`,
          icon: TrendingDown,
          color: 'danger',
          subtext: `${report.expenses?.expense_count || 0} expense entries`
        },
        {
          title: 'Batch Costs',
          value: `ETB ${Number(report.details?.batches?.total_batch_cost || 0).toFixed(2)}`,
          icon: Package,
          color: 'warning',
          subtext: `${report.details?.batches?.batch_count || 0} batches`
        },
        {
          title: 'Gross Profit',
          value: `ETB ${Number(report.profit?.gross_profit || 0).toFixed(2)}`,
          icon: TrendingUp,
          color: Number(report.profit?.gross_profit || 0) >= 0 ? 'success' : 'danger',
          subtext: 'Sales - Expenses'
        },
        {
          title: 'Net Profit',
          value: `ETB ${Number(report.profit?.net_profit || 0).toFixed(2)}`,
          icon: TrendingUp,
          color: Number(report.profit?.net_profit || 0) >= 0 ? 'success' : 'danger',
          subtext: `Margin: ${report.profit?.margin_percent || 0}%`
        }
      ];
    }
    
    return [];
  };

  const stats = getStats();

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h2>{t('dashboard')}</h2>
        <p className="dashboard-date">
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
      </div>

      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <div className="d-flex align-items-center gap-2">
              <Calendar size={20} />
              <strong>Period:</strong>
            </div>
            <div className="btn-group" role="group">
              <button 
                className={`btn btn-sm ${period === 'daily' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setPeriod('daily')}
              >
                Daily
              </button>
              <button 
                className={`btn btn-sm ${period === 'weekly' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setPeriod('weekly')}
              >
                Weekly
              </button>
              <button 
                className={`btn btn-sm ${period === 'monthly' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setPeriod('monthly')}
              >
                Monthly
              </button>
            </div>
            
            {period === 'daily' && (
              <input 
                type="date" 
                className="form-control form-control-sm" 
                style={{ width: 'auto' }}
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            )}
          </div>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((stat, idx) => (
          <div key={idx} className="stat-card card">
            <div className="stat-icon" style={{ background: `var(--${stat.color})` }}>
              <stat.icon size={24} color="white" />
            </div>
            <div className="stat-content">
              <div className="stat-label">{stat.title}</div>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-subtext">{stat.subtext}</div>
            </div>
          </div>
        ))}
      </div>

      {report?.details?.batches?.batch_list && report.details.batches.batch_list.length > 0 && (
        <div className="card mb-4" style={{ marginTop: '1rem' }}>
          <div className="card-header d-flex justify-content-between align-items-center">
            <h3 className="mb-0">
              <Package size={20} className="me-2" />
              {period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'} Batch Costs
            </h3>
            <span className="badge bg-warning text-dark">
              Total: ETB {Number(report.details.batches.total_batch_cost || 0).toFixed(2)} ({report.details.batches.batch_count || 0} batches)
            </span>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-sm table-hover">
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>Date/Time</th>
                    <th>Created By</th>
                    <th>Product</th>
                    <th>Source</th>
                    <th>Qty</th>
                    <th>Unit Cost</th>
                    <th>Line Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {report.details.batches.batch_list.map((item, idx) => (
                    <tr key={`${item.batch_id}-${item.product_id}-${idx}`}>
                      <td>#{item.batch_id}</td>
                      <td>{new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString()}</td>
                      <td>{item.created_by_name}</td>
                      <td>{item.product_name}</td>
                      <td>
                        <span className={`badge ${item.source === 'baked' ? 'bg-success' : 'bg-secondary'}`}>
                          {item.source}
                        </span>
                      </td>
                      <td>{item.quantity}</td>
                      <td>ETB {Number(item.unit_cost || 0).toFixed(2)}</td>
                      <td><strong>ETB {Number(item.line_cost || 0).toFixed(2)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="table-warning">
                    <th colSpan={7} className="text-end">Total Batch Cost:</th>
                    <th>ETB {Number(report.details.batches.total_batch_cost || 0).toFixed(2)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {kpis && (
        <div className="stats-grid" style={{ marginTop: '1rem' }}>
          <div className="stat-card card">
            <div className="stat-content">
              <div className="stat-label">Cashier Avg Order Time</div>
              <div className="stat-value">{Number(kpis.avg_cashier_order_seconds || 0).toFixed(1)}s</div>
              <div className="stat-subtext">Target: &lt; {kpis?.goals?.cashier_order_target_seconds || 0}s</div>
            </div>
          </div>
          <div className="stat-card card">
            <div className="stat-content">
              <div className="stat-label">Batch Zero-Retry Rate</div>
              <div className="stat-value">{Number(kpis.batch_zero_retry_rate_percent || 0).toFixed(1)}%</div>
              <div className="stat-subtext">Target: {kpis?.goals?.batch_zero_retry_target_percent || 0}%</div>
            </div>
          </div>
          <div className="stat-card card">
            <div className="stat-content">
              <div className="stat-label">Owner Report Views (7d)</div>
              <div className="stat-value">{Number(kpis.owner_report_views_weekly || 0)}</div>
              <div className="stat-subtext">Target: {kpis?.goals?.owner_views_target_weekly || 0}/week</div>
            </div>
          </div>
        </div>
      )}

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <h3>{period === 'daily' ? 'Top Products' : 'Weekly Sales Trend'}</h3>
          </div>
          <div className="card-body">
            {period === 'daily' ? (
              report?.top_products?.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={report.top_products.slice(0, 5)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value) => `ETB ${Number(value).toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="revenue" fill="var(--success)" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted">No sales data for this date</p>
              )
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={report?.sales_by_day || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => `ETB ${Number(value).toFixed(2)}`}
                    labelFormatter={(date) => new Date(date).toLocaleDateString()}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="total_sales" 
                    stroke="var(--primary)" 
                    strokeWidth={2}
                    name="Sales"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Payment Methods {period === 'daily' ? '(Today)' : '(Weekly)'}</h3>
          </div>
          <div className="card-body">
            <div className="payment-methods">
              {(report?.payment_methods || []).map((method, idx) => (
                <div key={idx} className="payment-method-item">
                  <div className="payment-method-label">{method.payment_method}</div>
                  <div className="payment-method-stats">
                    <span className="payment-count badge badge-primary">{method.count} sales</span>
                    <span className="payment-amount">ETB {Number(method.total).toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {(!report?.payment_methods || report.payment_methods.length === 0) && (
                <p className="text-muted">No payment data for this period</p>
              )}
            </div>
          </div>
        </div>
      </div>



      {report && (
        <div className="card mb-4">
          <div className="card-header"><h3>Detailed Transparency</h3></div>
          <div className="card-body">
            <div className="row g-4">
              <div className="col-lg-6">
                <h4>Products Sold</h4>
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
                    <tbody>
                      {(report.top_products || []).map((item, idx) => (
                        <tr key={`${item.name}-${idx}`}><td>{item.name}</td><td>{item.total_sold}</td><td>ETB {Number(item.revenue || 0).toFixed(2)}</td></tr>
                      ))}
                      {(!report.top_products || report.top_products.length === 0) && <tr><td colSpan={3} className="text-center">No product sales in this period.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="col-lg-6">
                <h4>Cashier & Ground Manager Performance</h4>
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead><tr><th>Team Member</th><th>Role</th><th>Sales</th><th>Txns</th><th>Items</th><th>Cash</th><th>Mobile</th></tr></thead>
                    <tbody>
                      {(report.details?.cashier_performance || []).map((row, idx) => (
                        <tr key={`${row.cashier_id}-${idx}`}>
                          <td>{row.cashier_name}</td>
                          <td><span className={`badge ${row.cashier_role === 'manager' ? 'badge-warning' : 'badge-primary'}`}>{row.cashier_role === 'manager' ? 'Ground Manager' : 'Cashier'}</span></td>
                          <td>ETB {Number(row.total_sales || 0).toFixed(2)}</td>
                          <td>{row.transactions}</td>
                          <td>{row.items_sold}</td>
                          <td>ETB {Number(row.cash_sales || 0).toFixed(2)}</td>
                          <td>ETB {Number(row.mobile_sales || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(!report.details?.cashier_performance || report.details.cashier_performance.length === 0) && <tr><td colSpan={7} className="text-center">No cashier or ground manager sales in this period.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="row g-4" style={{ marginTop: '0.5rem' }}>
              <div className="col-lg-6">
                <h4>Expense Records</h4>
                <div className="table-responsive">
                  <table className="table table-hover transparency-table">
                    <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Created By</th></tr></thead>
                    <tbody>
                      {(report.details?.expenses || []).slice(0, 10).map((exp) => (
                        <tr key={exp.id}><td>{exp.expense_date}</td><td>{exp.category}</td><td>ETB {Number(exp.amount || 0).toFixed(2)}</td><td>{exp.created_by_name || 'System'}</td></tr>
                      ))}
                      {(!report.details?.expenses || report.details.expenses.length === 0) && <tr><td colSpan={4} className="text-center">No expense records in this period.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="col-lg-6">
                <h4>Cost Components</h4>
                <div className="table-responsive">
                  <table className="table table-hover transparency-table">
                    <thead><tr><th>Component</th><th>Amount</th><th>Transparency Note</th></tr></thead>
                    <tbody>
                      <tr><td>Total Revenue</td><td>ETB {Number(period === 'daily' ? report.sales?.total_sales : period === 'weekly' ? report.summary?.total_sales : report.sales?.total_sales || 0).toFixed(2)}</td><td>From completed sales in this period</td></tr>
                      <tr><td>Batch Production Cost</td><td>ETB {Number(report.details?.batches?.total_batch_cost || 0).toFixed(2)}</td><td>{Number(report.details?.batches?.batch_count || 0)} non-voided batches × product unit cost</td></tr>
                      <tr><td>Manual Expenses</td><td>ETB {Number(report.expenses?.total_expenses || report.summary?.total_expenses || 0).toFixed(2)}</td><td>Recorded expenses table entries</td></tr>
                      <tr><td>Staff Payments</td><td>ETB {Number(report.staff_payments?.total_staff_payments || report.summary?.total_staff_payments || 0).toFixed(2)}</td><td>Payroll and advances paid in period</td></tr>
                      <tr className="table-light"><td><strong>Net Profit</strong></td><td><strong>ETB {Number(report.profit?.net_profit || report.summary?.net_profit || 0).toFixed(2)}</strong></td><td>Revenue - all costs above</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {branchSummary.length > 0 && (
        <div className="card mb-4">
          <div className="card-header"><h3>Multi-Branch Snapshot (Today)</h3></div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Sales</th>
                    <th>Transactions</th>
                    <th>Expenses</th>
                    <th>Staff Payments</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {branchSummary.map((b) => (
                    <tr key={b.location_id}>
                      <td>{b.location_name}</td>
                      <td>ETB {Number(b.today_sales).toFixed(2)}</td>
                      <td>{Number(b.today_transactions)}</td>
                      <td>ETB {Number(b.today_expenses).toFixed(2)}</td>
                      <td>ETB {Number(b.today_staff_payments || 0).toFixed(2)}</td>
                      <td className={Number(b.today_net) >= 0 ? 'text-success' : 'text-danger'}>
                        ETB {Number(b.today_net).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="details-grid">
        <div className="card">
          <div className="card-header">
            <h3>{period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'} Summary</h3>
          </div>
          <div className="card-body">
            <div className="summary-list">
              <div className="summary-item">
                <span>Total Revenue</span>
                <strong>ETB {Number(period === 'daily' ? report?.sales?.total_sales : period === 'weekly' ? report?.summary?.total_sales : report?.sales?.total_sales || 0).toFixed(2)}</strong>
              </div>
              <div className="summary-item">
                <span>Total Expenses</span>
                <strong>ETB {Number(period === 'daily' ? report?.expenses?.total_expenses : period === 'weekly' ? report?.summary?.total_expenses : report?.expenses?.total_expenses || 0).toFixed(2)}</strong>
              </div>
              <div className="summary-item">
                <span>Total Staff Payments</span>
                <strong>ETB {Number(period === 'daily' ? report?.staff_payments?.total_staff_payments : period === 'weekly' ? report?.summary?.total_staff_payments : report?.staff_payments?.total_staff_payments || 0).toFixed(2)}</strong>
              </div>
              <div className="summary-item">
                <span>Total Costs</span>
                <strong>ETB {Number(period === 'daily' ? report?.profit?.total_costs : period === 'weekly' ? report?.summary?.total_costs : report?.costs?.total_costs || 0).toFixed(2)}</strong>
              </div>
              <div className="summary-item highlight">
                <span>Net Profit</span>
                <strong className={Number(period === 'daily' ? report?.profit?.net_profit : period === 'weekly' ? report?.summary?.net_profit : report?.profit?.net_profit || 0) >= 0 ? 'text-success' : 'text-danger'}>
                  ETB {Number(period === 'daily' ? report?.profit?.net_profit : period === 'weekly' ? report?.summary?.net_profit : report?.profit?.net_profit || 0).toFixed(2)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
