import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { TrendingUp, TrendingDown, DollarSign, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import './Dashboard.css';

export default function Dashboard() {
  const { selectedLocationId } = useBranch();
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [branchSummary, setBranchSummary] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, [selectedLocationId]);

  const fetchReports = async () => {
    try {
      const [weekly, monthly, branches, kpiRes] = await Promise.all([
        api.get('/reports/weekly'),
        api.get('/reports/monthly').catch(() => ({ data: null })),
        api.get('/reports/branches/summary').catch(() => ({ data: [] })),
        api.get('/reports/kpis').catch(() => ({ data: null }))
      ]);
      setWeeklyReport(weekly.data);
      setMonthlyReport(monthly.data);
      setBranchSummary(branches.data || []);
      setKpis(kpiRes.data);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  const stats = [
    {
      title: 'Daily Sales',
      value: `$${Number(weeklyReport?.summary?.total_sales || 0).toFixed(2)}`,
      icon: DollarSign,
      color: 'primary',
      subtext: `Weekly • ${weeklyReport?.summary?.total_transactions || 0} transactions`
    },
    {
      title: 'Weekly Expenses',
      value: `$${Number(weeklyReport?.summary?.total_expenses || 0).toFixed(2)}`,
      icon: TrendingDown,
      color: 'danger',
      subtext: `${weeklyReport?.summary?.expense_count || 0} expense entries`
    },
    {
      title: 'Weekly Profit',
      value: `$${Number(weeklyReport?.summary?.net_profit || 0).toFixed(2)}`,
      icon: TrendingUp,
      color: 'success',
      subtext: 'Revenue - expenses'
    },
    {
      title: 'Monthly Net Flow',
      value: `$${Number(monthlyReport?.summary?.net_profit || 0).toFixed(2)}`,
      icon: Package,
      color: 'info',
      subtext: `${monthlyReport?.summary?.total_transactions || 0} monthly transactions`
    }
  ];

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h2>Admin Dashboard</h2>
        <p className="dashboard-date">
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
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


      <div className="alert alert-info mb-4">
        <strong>Active Branch Context:</strong> Dashboard values reflect the selected branch from the top selector.
      </div>

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
            <h3>Weekly Sales Trend</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyReport?.sales_by_day || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value) => `$${Number(value).toFixed(2)}`}
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
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Top Products (Weekly)</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyReport?.top_products?.slice(0, 5) || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
                <Legend />
                <Bar dataKey="revenue" fill="var(--success)" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>


      {branchSummary.length > 0 && (
        <div className="card mb-4">
          <div className="card-header"><h3>Multi-Branch Snapshot (Today)</h3></div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover">
                <thead><tr><th>Branch</th><th>Sales</th><th>Transactions</th><th>Expenses</th></tr></thead>
                <tbody>
                  {branchSummary.map((b) => (
                    <tr key={b.location_id}>
                      <td>{b.location_name}</td>
                      <td>${Number(b.today_sales).toFixed(2)}</td>
                      <td>{Number(b.today_transactions)}</td>
                      <td>${Number(b.today_expenses).toFixed(2)}</td>
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
            <h3>Payment Methods</h3>
          </div>
          <div className="card-body">
            <div className="payment-methods">
              {weeklyReport?.payment_methods?.map((method, idx) => (
                <div key={idx} className="payment-method-item">
                  <div className="payment-method-label">{method.payment_method}</div>
                  <div className="payment-method-stats">
                    <span className="payment-count badge badge-primary">{method.count} sales</span>
                    <span className="payment-amount">${Number(method.total).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Weekly Summary</h3>
          </div>
          <div className="card-body">
            <div className="summary-list">
              <div className="summary-item">
                <span>Total Sales</span>
                <strong>${Number(weeklyReport?.summary?.total_sales || 0).toFixed(2)}</strong>
              </div>
              <div className="summary-item">
                <span>Total Expenses</span>
                <strong>${Number(weeklyReport?.summary?.total_expenses || 0).toFixed(2)}</strong>
              </div>
              <div className="summary-item">
                <span>Net Profit</span>
                <strong className="text-success">
                  ${Number(weeklyReport?.summary?.net_profit || 0).toFixed(2)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
