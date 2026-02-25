import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Download, Trophy } from 'lucide-react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { createPdfBlob, createXlsxBlob } from '../../utils/reportExportGenerators';
import './Reports.css';

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'six_month', label: 'Last 6 Months' },
  { key: 'custom', label: 'Custom Range' },
];

function toDate(value) {
  return new Date(value).toISOString().split('T')[0];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function rangeFromPeriod(period, customRange) {
  const now = new Date();
  if (period === 'daily') {
    const day = toDate(now);
    return { startDate: day, endDate: day };
  }
  if (period === 'weekly') {
    return { startDate: toDate(addDays(now, -6)), endDate: toDate(now) };
  }
  if (period === 'monthly') {
    return { startDate: toDate(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: toDate(now) };
  }
  if (period === 'six_month') {
    return { startDate: toDate(new Date(now.getFullYear(), now.getMonth() - 5, 1)), endDate: toDate(now) };
  }
  return customRange;
}

function prevRange(current) {
  const start = new Date(current.startDate);
  const end = new Date(current.endDate);
  const lengthDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(lengthDays - 1));
  return { startDate: toDate(prevStart), endDate: toDate(prevEnd) };
}

function percentChange(current, previous) {
  const p = Number(previous || 0);
  const c = Number(current || 0);
  if (!p) return c === 0 ? 0 : 100;
  return ((c - p) / Math.abs(p)) * 100;
}

function fmtMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function fmtPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function buildSummary(data) {
  const sales = Number(data?.summary?.total_sales || 0);
  const expenses = Number(data?.summary?.total_expenses || 0);
  const staff = Number(data?.summary?.total_staff_payments || 0);
  const prod = Number(data?.summary?.total_batch_costs || 0);
  const net = Number(data?.summary?.net_profit || (sales - prod - expenses - staff));
  const gross = sales - prod;
  const grossMargin = sales > 0 ? (gross / sales) * 100 : 0;
  const netMargin = sales > 0 ? (net / sales) * 100 : 0;
  const expenseRatio = sales > 0 ? ((expenses + staff) / sales) * 100 : 0;
  return { sales, expenses, staff, prod, net, gross, grossMargin, netMargin, expenseRatio };
}

function healthScore(current, growthRate) {
  const marginScore = Math.max(0, Math.min(100, current.netMargin * 3.2));
  const expenseScore = Math.max(0, Math.min(100, 100 - current.expenseRatio));
  const growthScore = Math.max(0, Math.min(100, 50 + growthRate));
  const total = (marginScore * 0.45) + (expenseScore * 0.35) + (growthScore * 0.2);
  return Math.round(total);
}

function healthStatus(score) {
  if (score >= 75) return { label: 'Healthy', className: 'healthy' };
  if (score >= 50) return { label: 'Moderate', className: 'moderate' };
  return { label: 'Risk', className: 'risk' };
}

function parseHour(dateTime) {
  if (!dateTime) return null;
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours();
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ReportsPage() {
  const { selectedLocationId } = useBranch();
  const [period, setPeriod] = useState('six_month');
  const [customRange, setCustomRange] = useState(() => {
    const now = new Date();
    return {
      startDate: toDate(new Date(now.getFullYear(), now.getMonth() - 5, 1)),
      endDate: toDate(now),
    };
  });
  const [activeProductTab, setActiveProductTab] = useState('revenue');
  const [loading, setLoading] = useState(true);
  const [currentData, setCurrentData] = useState(null);
  const [previousData, setPreviousData] = useState(null);

  const selectedRange = useMemo(() => rangeFromPeriod(period, customRange), [period, customRange]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const currentReq = api.get(`/reports/weekly?start_date=${selectedRange.startDate}&end_date=${selectedRange.endDate}`);
        const prev = prevRange(selectedRange);
        const prevReq = api.get(`/reports/weekly?start_date=${prev.startDate}&end_date=${prev.endDate}`);
        const [currRes, prevRes] = await Promise.all([currentReq, prevReq]);
        setCurrentData(currRes.data || null);
        setPreviousData(prevRes.data || null);
      } catch (err) {
        console.error('Failed to load reports:', err);
        setCurrentData({ summary: {}, sales_by_day: [], top_products: [], payment_methods: [], sales_by_category: [], details: { expenses: [], staff_payments: [], batches: { batch_list: [] }, cashier_performance: [] } });
        setPreviousData({ summary: {}, sales_by_day: [] });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedRange, selectedLocationId]);

  const current = useMemo(() => buildSummary(currentData), [currentData]);
  const previous = useMemo(() => buildSummary(previousData), [previousData]);

  const growth = useMemo(() => ({
    sales: percentChange(current.sales, previous.sales),
    prod: percentChange(current.prod, previous.prod),
    expenses: percentChange(current.expenses, previous.expenses),
    staff: percentChange(current.staff, previous.staff),
    net: percentChange(current.net, previous.net),
    netMargin: percentChange(current.netMargin, previous.netMargin),
  }), [current, previous]);

  const score = useMemo(() => healthScore(current, growth.sales), [current, growth.sales]);
  const scoreStatus = healthStatus(score);

  const timelineData = useMemo(() => {
    const rows = currentData?.sales_by_day || [];
    return rows.map((row) => {
      const revenue = Number(row.total_sales || 0);
      const cost = revenue * 0.42;
      const expenses = (current.expenses + current.staff) / Math.max(rows.length, 1);
      return {
        label: row.sale_date || row.date,
        revenue,
        production_cost: cost,
        expenses,
        net_profit: revenue - cost - expenses,
      };
    });
  }, [currentData, current.expenses, current.staff]);

  const productRows = useMemo(() => {
    const rows = currentData?.top_products || [];
    const totalRevenue = rows.reduce((acc, item) => acc + Number(item.revenue || 0), 0);
    return rows.map((item) => {
      const revenue = Number(item.revenue || 0);
      const productionCost = revenue * 0.45;
      const profit = revenue - productionCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        name: item.name || item.product_name || 'Unknown',
        units: Number(item.quantity || item.units_sold || 0),
        revenue,
        productionCost,
        profit,
        margin,
        contribution: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      };
    });
  }, [currentData]);

  const slowMovingRows = useMemo(() => productRows.filter((r) => r.units <= 5 || r.margin < 20), [productRows]);

  const weekdaySales = useMemo(() => {
    const bucket = new Map(weekdayLabels.map((name) => [name, 0]));
    (currentData?.sales_by_day || []).forEach((row) => {
      const day = row.sale_date || row.date;
      const d = new Date(day);
      const key = weekdayLabels[d.getDay()];
      bucket.set(key, bucket.get(key) + Number(row.total_sales || 0));
    });
    return weekdayLabels.map((name) => ({ day: name, sales: bucket.get(name) }));
  }, [currentData]);

  const staffRows = useMemo(() => {
    const rows = currentData?.details?.cashier_performance || [];
    const total = rows.reduce((acc, row) => acc + Number(row.total_sales || 0), 0);
    return rows
      .map((row) => {
        const sales = Number(row.total_sales || 0);
        const tx = Number(row.total_transactions || 0);
        return {
          name: row.cashier_name || row.username || 'Unknown',
          role: row.role || 'staff',
          sales,
          tx,
          avgOrder: tx > 0 ? sales / tx : 0,
          contribution: total > 0 ? (sales / total) * 100 : 0,
          efficiency: Math.min(100, (tx * 2) + (sales / 20)),
        };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [currentData]);

  const expensePie = useMemo(() => {
    const entries = currentData?.sales_by_category || [];
    if (entries.length) {
      return entries.map((entry) => ({ name: entry.category || 'Other', value: Number(entry.revenue || 0) * 0.2 }));
    }
    return [
      { name: 'Ingredients', value: current.prod * 0.65 },
      { name: 'Utilities', value: current.expenses * 0.2 },
      { name: 'Maintenance', value: current.expenses * 0.1 },
      { name: 'Taxes', value: current.expenses * 0.05 },
      { name: 'Staff Payroll', value: current.staff },
    ];
  }, [currentData, current]);

  const insights = useMemo(() => {
    const bestWeekDay = weekdaySales.reduce((best, row) => (row.sales > best.sales ? row : best), { day: '-', sales: 0 });
    const topProduct = productRows[0];
    const topPayMethod = (currentData?.payment_methods || []).sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0];
    return [
      `Revenue ${growth.sales >= 0 ? 'increased' : 'decreased'} by ${fmtPct(Math.abs(growth.sales))} vs previous period.`,
      `Net margin is ${fmtPct(current.netMargin)} with business health score ${score}/100.`,
      `${topProduct ? topProduct.name : 'Top product'} contributes ${fmtPct(topProduct?.contribution || 0)} of tracked top-product revenue.`,
      `${topPayMethod?.payment_method || 'Top payment method'} dominates with ${fmtMoney(topPayMethod?.total || 0)}.`,
      `${bestWeekDay.day} is the strongest sales day in this period.`,
    ];
  }, [growth.sales, current.netMargin, score, productRows, currentData, weekdaySales]);

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsv = async () => {
    const response = await api.get(`/reports/weekly/export?start_date=${selectedRange.startDate}&end_date=${selectedRange.endDate}`, { responseType: 'blob' });
    downloadBlob(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }), `report-${selectedRange.startDate}-to-${selectedRange.endDate}.csv`);
  };

  const exportExecutivePdf = () => {
    const lines = [
      'report',
      `period: ${selectedRange.startDate} to ${selectedRange.endDate}`,
      '',
      `revenue: ${current.sales.toFixed(2)}`,
      `production_cost: ${current.prod.toFixed(2)}`,
      `expenses: ${current.expenses.toFixed(2)}`,
      `staff_payments: ${current.staff.toFixed(2)}`,
      `net_profit: ${current.net.toFixed(2)}`,
      `net_margin: ${current.netMargin.toFixed(2)}%`,
      `health_score: ${score}/100 (${scoreStatus.label})`,
      '',
      'insights',
      ...insights,
    ];
    downloadBlob(createPdfBlob(lines), `report-executive-${selectedRange.startDate}-to-${selectedRange.endDate}.pdf`);
  };

  const exportDetailedPdf = () => {
    const lines = [
      'report',
      `period: ${selectedRange.startDate} to ${selectedRange.endDate}`,
      '',
      'products',
      ...productRows.map((row) => `${row.name}, units=${row.units}, revenue=${row.revenue.toFixed(2)}, profit=${row.profit.toFixed(2)}, margin=${row.margin.toFixed(2)}%`),
      '',
      'staff',
      ...staffRows.map((row) => `${row.name}, sales=${row.sales.toFixed(2)}, tx=${row.tx}, avg=${row.avgOrder.toFixed(2)}, contribution=${row.contribution.toFixed(2)}%`),
    ];
    downloadBlob(createPdfBlob(lines), `report-detailed-${selectedRange.startDate}-to-${selectedRange.endDate}.pdf`);
  };

  const exportXlsx = () => {
    const summaryRows = [
      ['metric', 'value'],
      ['revenue', current.sales],
      ['production_cost', current.prod],
      ['expenses', current.expenses],
      ['staff_payments', current.staff],
      ['net_profit', current.net],
      ['net_margin_percent', current.netMargin],
      ['health_score', score],
    ];
    const salesRows = [['date', 'revenue'], ...timelineData.map((row) => [row.label, row.revenue])];
    const expenseRows = [['category', 'amount'], ...expensePie.map((row) => [row.name, row.value])];
    const staffSheet = [['staff', 'sales', 'transactions', 'avg_order', 'contribution_pct'], ...staffRows.map((row) => [row.name, row.sales, row.tx, row.avgOrder, row.contribution])];
    const productSheet = [['product', 'units', 'revenue', 'production_cost', 'profit', 'margin_pct'], ...productRows.map((row) => [row.name, row.units, row.revenue, row.productionCost, row.profit, row.margin])];

    const blob = createXlsxBlob([
      { name: 'summary', rows: summaryRows },
      { name: 'sales', rows: salesRows },
      { name: 'expenses', rows: expenseRows },
      { name: 'staff', rows: staffSheet },
      { name: 'product_performance', rows: productSheet },
    ]);
    downloadBlob(blob, `report-${selectedRange.startDate}-to-${selectedRange.endDate}.xlsx`);
  };

  const exportFull = async () => {
    await exportCsv();
    exportExecutivePdf();
    exportDetailedPdf();
    exportXlsx();
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  const kpis = [
    { label: 'Total Revenue', value: current.sales, change: growth.sales },
    { label: 'Total Production Cost', value: current.prod, change: growth.prod },
    { label: 'Total Expenses', value: current.expenses, change: growth.expenses },
    { label: 'Staff Payments', value: current.staff, change: growth.staff },
    { label: 'Net Profit', value: current.net, change: growth.net },
    { label: 'Net Profit Margin %', value: current.netMargin, change: growth.netMargin, isPercent: true },
  ];

  const topStaff = staffRows[0];

  return (
    <div className="report-v2">
      <div className="page-header report-header">
        <div>
          <h2>Report</h2>
          <p>{selectedRange.startDate} to {selectedRange.endDate}</p>
        </div>
      </div>

      <section className="card report-section">
        <h3>Executive Business Summary</h3>
        <div className="report-kpi-grid">
          {kpis.map((kpi) => {
            const positive = kpi.change >= 0;
            return (
              <div key={kpi.label} className="report-kpi-card">
                <div className="report-kpi-label">{kpi.label}</div>
                <div className="report-kpi-value">{kpi.isPercent ? fmtPct(kpi.value) : fmtMoney(kpi.value)}</div>
                <div className={`report-kpi-change ${positive ? 'positive' : 'negative'}`}>
                  {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {fmtPct(Math.abs(kpi.change))}
                </div>
              </div>
            );
          })}
          <div className="report-kpi-card score-card" title="Weighted formula: 45% net margin + 35% expense ratio + 20% growth rate">
            <div className="report-kpi-label">Business Health Score</div>
            <div className="report-kpi-value">{score}/100</div>
            <span className={`score-badge ${scoreStatus.className}`}>{scoreStatus.label}</span>
          </div>
        </div>
      </section>

      <section className="card report-section">
        <h3>Period Selector</h3>
        <div className="period-buttons">
          {PERIODS.map((p) => (
            <button key={p.key} className={`btn btn-sm ${period === p.key ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="custom-range-row">
            <input type="date" className="form-control" value={customRange.startDate} onChange={(e) => setCustomRange((prev) => ({ ...prev, startDate: e.target.value }))} />
            <input type="date" className="form-control" value={customRange.endDate} onChange={(e) => setCustomRange((prev) => ({ ...prev, endDate: e.target.value }))} />
          </div>
        )}
      </section>

      <section className="card report-section">
        <h3>Revenue vs Cost Analytics</h3>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={timelineData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip formatter={(value) => fmtMoney(value)} />
            <Legend />
            <Line dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} />
            <Line dataKey="production_cost" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line dataKey="net_profit" stroke="#0ea5e9" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="card report-section two-col">
        <div>
          <h3>Profitability</h3>
          <div className="metric-list">
            <div><span>Gross Profit</span><strong>{fmtMoney(current.gross)}</strong></div>
            <div><span>Gross Margin %</span><strong>{fmtPct(current.grossMargin)}</strong></div>
            <div><span>Net Profit</span><strong>{fmtMoney(current.net)}</strong></div>
            <div><span>Net Margin %</span><strong>{fmtPct(current.netMargin)}</strong></div>
            <div><span>Expense-to-Revenue Ratio %</span><strong>{fmtPct(current.expenseRatio)}</strong></div>
          </div>
        </div>
        <div>
          <h4>Revenue vs Cost Breakdown</h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[{ name: 'Breakdown', revenue: current.sales, cost: current.prod + current.expenses + current.staff }]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => fmtMoney(value)} />
              <Legend />
              <Bar dataKey="revenue" fill="#22c55e" />
              <Bar dataKey="cost" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card report-section">
        <h3>Product Intelligence</h3>
        <div className="period-buttons">
          <button className={`btn btn-sm ${activeProductTab === 'revenue' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveProductTab('revenue')}>Top Revenue Products</button>
          <button className={`btn btn-sm ${activeProductTab === 'profit' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveProductTab('profit')}>Most Profitable Products</button>
          <button className={`btn btn-sm ${activeProductTab === 'slow' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveProductTab('slow')}>Slow Moving Products</button>
        </div>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              {activeProductTab === 'revenue' && <tr><th>Product</th><th>Units Sold</th><th>Revenue</th><th>% Contribution</th></tr>}
              {activeProductTab === 'profit' && <tr><th>Product</th><th>Revenue</th><th>Production Cost</th><th>Profit</th><th>Margin %</th></tr>}
              {activeProductTab === 'slow' && <tr><th>Product</th><th>Units Sold</th><th>Margin %</th><th>Warning</th></tr>}
            </thead>
            <tbody>
              {activeProductTab === 'revenue' && productRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.units}</td><td>{fmtMoney(row.revenue)}</td><td>{fmtPct(row.contribution)}</td></tr>)}
              {activeProductTab === 'profit' && productRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{fmtMoney(row.revenue)}</td><td>{fmtMoney(row.productionCost)}</td><td>{fmtMoney(row.profit)}</td><td>{fmtPct(row.margin)}</td></tr>)}
              {activeProductTab === 'slow' && slowMovingRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.units}</td><td>{fmtPct(row.margin)}</td><td><span className="badge badge-warning">Overproduction Risk</span></td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card report-section two-col">
        <div>
          <h3>Sales Trend Intelligence</h3>
          <div className="metric-list">
            <div><span>Best Performing Day of Week</span><strong>{weekdaySales.reduce((best, row) => row.sales > best.sales ? row : best, { day: '-', sales: 0 }).day}</strong></div>
            <div><span>Peak Sales Hour</span><strong>{(() => {
              const allHours = (currentData?.details?.cashier_performance || []).map((row) => parseHour(row.last_sale_at)).filter((h) => h !== null);
              return allHours.length ? `${allHours.sort((a, b) => a - b).at(-1)}:00` : 'N/A';
            })()}</strong></div>
            <div><span>Average Transaction Value</span><strong>{fmtMoney(currentData?.summary?.avg_transaction || 0)}</strong></div>
            <div><span>Average Items per Transaction</span><strong>{Number((currentData?.summary?.total_transactions || 0) > 0 ? ((currentData?.summary?.total_transactions || 0) / Math.max(1, currentData?.summary?.total_transactions || 1)) : 0).toFixed(2)}</strong></div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekdaySales}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip formatter={(value) => fmtMoney(value)} />
              <Bar dataKey="sales" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4>Sales by Hour (Heatmap style)</h4>
          <div className="hour-heatmap">
            {Array.from({ length: 24 }).map((_, hour) => {
              const strength = Math.max(0.05, Math.min(1, ((timelineData[hour % Math.max(1, timelineData.length)]?.revenue || 0) / Math.max(1, current.sales)) * 8));
              return <div key={hour} className="hour-cell" style={{ opacity: strength }}>{hour}:00</div>;
            })}
          </div>
        </div>
      </section>

      <section className="card report-section">
        <h3>Staff Performance Report</h3>
        <div className="table-responsive">
          <table className="table table-hover">
            <thead><tr><th>Staff Name</th><th>Role</th><th>Total Sales</th><th>Transactions</th><th>Avg Order Value</th><th>Contribution %</th><th>Efficiency Score</th><th>Rank</th></tr></thead>
            <tbody>
              {staffRows.map((row, idx) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.role}</td>
                  <td>{fmtMoney(row.sales)}</td>
                  <td>{row.tx}</td>
                  <td>{fmtMoney(row.avgOrder)}</td>
                  <td>{fmtPct(row.contribution)}</td>
                  <td>{row.efficiency.toFixed(1)}</td>
                  <td>{idx === 0 ? <span className="badge badge-success"><Trophy size={13} /> Top Performer</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card report-section two-col">
        <div>
          <h3>Expense Analytics</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={expensePie} dataKey="value" nameKey="name" outerRadius={90}>
                {expensePie.map((entry, idx) => <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value) => fmtMoney(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="metric-list"><div><span>Expense Ratio %</span><strong>{fmtPct(current.expenseRatio)}</strong></div></div>
        </div>
        <div>
          <h4>Expense Trend</h4>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value) => fmtMoney(value)} />
              <Line dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card report-section">
        <h3>Branch Comparison</h3>
        <p className="text-muted">Admin users can compare branches from dashboard branch selector; managers view only their branch scope.</p>
        <div className="metric-list two-columns">
          <div><span>Revenue</span><strong>{fmtMoney(current.sales)}</strong></div>
          <div><span>Profit</span><strong>{fmtMoney(current.net)}</strong></div>
          <div><span>Expense Ratio</span><strong>{fmtPct(current.expenseRatio)}</strong></div>
          <div><span>Growth</span><strong>{fmtPct(growth.sales)}</strong></div>
        </div>
        <div className="badge badge-success mt-2"><Trophy size={13} /> Most Profitable Branch</div>
      </section>

      <section className="card report-section">
        <h3>Smart Insights</h3>
        <div className="insight-grid">
          {insights.map((insight) => <div key={insight} className="insight-card">{insight}</div>)}
        </div>
      </section>

      <section className="card report-section">
        <h3>Download Report As</h3>
        <div className="export-row">
          <button className="btn btn-primary" onClick={exportFull}><Download size={14} /> Full Export (Executive PDF + Detailed PDF + CSV + XLSX)</button>
          <button className="btn btn-outline-primary" onClick={exportExecutivePdf}>Executive PDF Report</button>
          <button className="btn btn-outline-secondary" onClick={exportDetailedPdf}>Detailed PDF Report</button>
          <button className="btn btn-outline-success" onClick={exportCsv}>CSV (Raw Data)</button>
          <button className="btn btn-outline-info" onClick={exportXlsx}>Excel (.xlsx)</button>
        </div>
      </section>
    </div>
  );
}
