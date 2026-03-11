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
  TrendingUp,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useLanguage } from '../../context/LanguageContext';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import './Dashboard.css';

const formatMoney = (value) => `ETB ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadReport = async () => {
      if (user?.role === 'admin' && !selectedLocationId) {
        setReport(null);
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
          const ordersRes = await api.get('/orders', { params: { include_completed: true } });
          setOrders(ordersRes.data || []);
        } else {
            setOrders([]);
        }
      } catch (err) {
        setError(err?.response?.data?.error || err?.message || 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [period, dailyDate, weekEndDate, monthValue, selectedLocationId, user?.role]);


  const selectedRange = useMemo(() => {
    if (period === 'daily') {
      const start = new Date(`${dailyDate}T00:00:00`);
      const end = new Date(`${dailyDate}T23:59:59.999`);
      return { start, end };
    }
    if (period === 'weekly') {
      const end = new Date(`${weekEndDate}T23:59:59.999`);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    const [year, month] = monthValue.split('-').map(Number);
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
  }, [period, dailyDate, weekEndDate, monthValue]);

  const orderPerformance = useMemo(() => {
    const relevant = (orders || []).filter((order) => {
      if (order.status !== 'picked_up') return false;
      const dateValue = order.delivered_at || order.updated_at || order.created_at;
      if (!dateValue) return false;
      const ts = new Date(dateValue).getTime();
      return ts >= selectedRange.start.getTime() && ts <= selectedRange.end.getTime();
    });

    const total = relevant.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    return { count: relevant.length, revenue: total, rows: relevant };
  }, [orders, selectedRange]);

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
        orderRevenue: 0,
        orderCount: 0,
      };
    }

    if (period === 'daily') {
      const baseRevenue = Number(report.sales?.total_sales || 0);
      const transactions = Number(report.sales?.total_transactions || 0);
      const expenses = Number(report.expenses?.total_expenses || 0);
      const staffPayments = Number(report.staff_payments?.total_staff_payments || 0);
      const batchCosts = Number(report.profit?.batch_costs || report.details?.batches?.total_batch_cost || 0);
      const totalCosts = Number(report.profit?.total_costs || expenses + staffPayments + batchCosts);
      const revenue = baseRevenue + orderPerformance.revenue;
      const netProfit = Number(report.profit?.net_profit || baseRevenue - totalCosts) + orderPerformance.revenue;
      return { revenue, transactions: transactions + orderPerformance.count, expenses, staffPayments, batchCosts, totalCosts, netProfit, orderRevenue: orderPerformance.revenue, orderCount: orderPerformance.count };
    }

    if (period === 'weekly') {
      const baseRevenue = Number(report.summary?.total_sales || 0);
      const transactions = Number(report.summary?.total_transactions || 0);
      const expenses = Number(report.summary?.total_expenses || 0);
      const staffPayments = Number(report.summary?.total_staff_payments || 0);
      const batchCosts = Number(report.summary?.total_batch_costs || report.details?.batches?.total_batch_cost || 0);
      const totalCosts = Number(report.summary?.total_costs || expenses + staffPayments + batchCosts);
      const revenue = baseRevenue + orderPerformance.revenue;
      const netProfit = Number(report.summary?.net_profit || baseRevenue - totalCosts) + orderPerformance.revenue;
      return { revenue, transactions: transactions + orderPerformance.count, expenses, staffPayments, batchCosts, totalCosts, netProfit, orderRevenue: orderPerformance.revenue, orderCount: orderPerformance.count };
    }

    const baseRevenue = Number(report.sales?.total_sales || 0);
    const transactions = Number(report.sales?.total_transactions || 0);
    const expenses = Number(report.expenses?.total_expenses || 0);
    const staffPayments = Number(report.staff_payments?.total_staff_payments || 0);
    const batchCosts = Number(report.costs?.batch_costs || report.details?.batches?.total_batch_cost || 0);
    const totalCosts = Number(report.costs?.total_costs || expenses + staffPayments + batchCosts);
    const revenue = baseRevenue + orderPerformance.revenue;
    const netProfit = Number(report.profit?.net_profit || baseRevenue - totalCosts) + orderPerformance.revenue;
    return { revenue, transactions: transactions + orderPerformance.count, expenses, staffPayments, batchCosts, totalCosts, netProfit, orderRevenue: orderPerformance.revenue, orderCount: orderPerformance.count };
  }, [report, period, orderPerformance]);

  const topProducts = report?.top_products || [];
  const paymentMethods = report?.payment_methods || [];
  const expenseRows = report?.details?.expenses || [];
  const staffPaymentRows = report?.details?.staff_payments || [];
  const cashierRows = report?.details?.cashier_performance || [];

  const periodLabel = period === 'daily'
    ? formatShortDate(dailyDate)
    : period === 'weekly'
      ? `${formatShortDate(report?.period?.start_date || weekEndDate)} - ${formatShortDate(report?.period?.end_date || weekEndDate)}`
      : new Date(`${monthValue}-01`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

  if (loading) {
    return (
      <div className="dashboard-page animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <Skeleton width="200px" height="2.5rem" />
          <Skeleton width="150px" height="2.5rem" />
        </div>
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height="120px" />)}
        </div>
        <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <Skeleton height="300px" />
          <Skeleton height="300px" />
        </div>
      </div>
    );
  }

  if (user?.role === 'admin' && !selectedLocationId) {
    return (
      <div className="dashboard-page animate-fade-in" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Card style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ background: 'var(--info-bg)', color: 'var(--info-text)', width: '64px', height: '64px', borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 1.5rem' }}>
            <ShoppingBag size={32} />
          </div>
          <h3>Select a branch</h3>
          <p>Please select a branch from the top bar to view dashboard data.</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page animate-fade-in">
        <Card style={{ border: '1px solid var(--text-error)', background: 'var(--error-bg)', padding: '2rem' }}>
          <p style={{ color: 'var(--text-error)', fontWeight: 600 }}>{error}</p>
          <Button variant="secondary" onClick={() => window.location.reload()} style={{ marginTop: '1rem' }}>Retry</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="dashboard-page animate-fade-in">
      <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>{t('dashboard')}</h1>
          <p style={{ fontWeight: 500 }}>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="controls-card" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', background: 'var(--card-bg)', padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--accent-border)' }}>
          <div className="btn-group" style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', padding: '0.25rem', borderRadius: 'var(--radius-sm)' }}>
            {['daily', 'weekly', 'monthly'].map(p => (
              <button
                key={p}
                className={period === p ? 'active' : ''}
                onClick={() => setPeriod(p)}
                style={{
                  border: 'none',
                  background: period === p ? 'var(--card-bg)' : 'transparent',
                  padding: '0.4rem 1rem',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  color: period === p ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: period === p ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          {period === 'daily' && <input type="date" className="input-field" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} style={{ minHeight: '2.25rem', padding: '0.25rem 0.5rem' }} />}
          {period === 'weekly' && <input type="date" className="input-field" value={weekEndDate} onChange={(e) => setWeekEndDate(e.target.value)} style={{ minHeight: '2.25rem', padding: '0.25rem 0.5rem' }} />}
          {period === 'monthly' && <input type="month" className="input-field" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} style={{ minHeight: '2.25rem', padding: '0.25rem 0.5rem' }} />}
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <Badge variant="primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
          <Calendar size={14} style={{ marginRight: '0.5rem' }} /> {periodLabel}
        </Badge>
      </div>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <StatCard
          icon={<TrendingUp size={24} />}
          label="Total Revenue"
          value={formatMoney(totals.revenue)}
          sub={`${totals.transactions} sales + picked-up orders`}
          trend={12}
        />
        <StatCard
          icon={<Receipt size={24} />}
          label="Total Expenses"
          value={formatMoney(totals.expenses)}
          sub={`${expenseRows.length} expense entries`}
          variant="warning"
        />
        <StatCard
          icon={<Users size={24} />}
          label="Staff Payments"
          value={formatMoney(totals.staffPayments)}
          sub={`${staffPaymentRows.length} payments`}
          variant="info"
        />
        <StatCard
          icon={<Wallet size={24} />}
          label="Net Profit"
          value={formatMoney(totals.netProfit)}
          sub="Revenue - all costs"
          variant={totals.netProfit >= 0 ? 'success' : 'danger'}
        />
      </div>

      <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <Card>
          <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.125rem' }}>Top Products by Revenue</h3>
            <ArrowUpRight size={20} color="var(--text-muted)" />
          </CardHeader>
          <CardBody>
            <div style={{ height: '300px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts.slice(0, 8)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 'var(--radius)', border: 'none', boxShadow: 'var(--shadow-md)', backgroundColor: 'var(--card-bg)' }}
                    formatter={(value) => formatMoney(value)}
                  />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]} barSize={32}>
                    {topProducts.slice(0, 8).map((_, idx) => (
                      <Cell key={idx} fill={idx % 2 === 0 ? 'var(--button-mid)' : 'var(--button-start)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 style={{ fontSize: '1.125rem' }}>Payment Distribution</h3>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {paymentMethods.map((row, idx) => (
                <div key={idx} style={{ padding: '1rem', borderRadius: 'var(--radius)', background: 'var(--surface-bg)', border: '1px solid var(--accent-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(244, 162, 97, 0.1)', color: 'var(--button-end)', display: 'grid', placeItems: 'center' }}>
                      <DollarSign size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{row.payment_method}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{row.count} transactions</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800 }}>{formatMoney(row.total)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{((Number(row.total) / totals.revenue) * 100).toFixed(1)}% share</div>
                  </div>
                </div>
              ))}
              {!paymentMethods.length && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No payment data available.</div>}
            </div>
          </CardBody>
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <Card>
          <CardHeader><h3>Performance Analytics</h3></CardHeader>
          <CardBody>
            <Table>
              <THead>
                <TR>
                  <TH>Team Member</TH>
                  <TH>Role</TH>
                  <TH>Sales</TH>
                  <TH>Txns</TH>
                  <TH>Items</TH>
                  <TH>Method Share</TH>
                </TR>
              </THead>
              <TBody>
                {cashierRows.map((r, i) => (
                  <TR key={i}>
                    <TD style={{ fontWeight: 600 }}>{r.cashier_name}</TD>
                    <TD><Badge variant="info">{r.cashier_role}</Badge></TD>
                    <TD style={{ fontWeight: 700 }}>{formatMoney(r.total_sales)}</TD>
                    <TD>{r.transactions}</TD>
                    <TD>{r.items_sold}</TD>
                    <TD>
                      <div style={{ fontSize: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--success-text)' }}>Cash: {formatMoney(r.cash_sales)}</span>
                        <span style={{ color: 'var(--button-end)' }}>Mobile: {formatMoney(r.mobile_sales)}</span>
                      </div>
                    </TD>
                  </TR>
                ))}
                {!cashierRows.length && (
                  <TR><TD colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No performance data in this period.</TD></TR>
                )}
              </TBody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3>Cost Transparency</h3></CardHeader>
          <CardBody>
            <Table>
              <THead>
                <TR>
                  <TH>Cost Component</TH>
                  <TH>Amount</TH>
                  <TH>Breakdown / Note</TH>
                </TR>
              </THead>
              <TBody>
                {[
                  { label: 'Total Revenue', value: totals.revenue, note: 'Gross sales including picked-up orders', variant: 'success' },
                  { label: 'Batch Production', value: totals.batchCosts, note: `${report?.details?.batches?.batch_count || 0} batches processed`, variant: 'danger' },
                  { label: 'Manual Expenses', value: totals.expenses, note: 'Miscellaneous business costs', variant: 'danger' },
                  { label: 'Staff Payroll', value: totals.staffPayments, note: 'Salaries and advances paid', variant: 'danger' },
                  { label: 'Net Profit', value: totals.netProfit, note: 'Final earnings after all costs', variant: 'primary', bold: true },
                ].map((row, i) => (
                  <TR key={i}>
                    <TD style={{ fontWeight: row.bold ? 800 : 600 }}>{row.label}</TD>
                    <TD style={{ fontWeight: 800, color: row.variant === 'danger' ? 'var(--text-error)' : row.variant === 'success' ? 'var(--success-text)' : 'inherit' }}>
                      {formatMoney(row.value)}
                    </TD>
                    <TD style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{row.note}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, variant = 'primary', trend }) {
  const colors = {
    primary: { bg: 'rgba(244, 162, 97, 0.1)', color: 'var(--button-end)' },
    warning: { bg: 'rgba(255, 152, 0, 0.1)', color: '#f57c00' },
    info: { bg: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' },
    success: { bg: 'rgba(45, 122, 56, 0.1)', color: '#2d7a38' },
    danger: { bg: 'rgba(211, 47, 47, 0.1)', color: '#d32f2f' },
  };

  const current = colors[variant] || colors.primary;

  return (
    <Card style={{ position: 'relative', overflow: 'hidden' }}>
      <CardBody style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: current.bg, color: current.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>{label}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {trend && (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', color: trend > 0 ? 'var(--success-text)' : 'var(--text-error)' }}>
                {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {Math.abs(trend)}%
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
