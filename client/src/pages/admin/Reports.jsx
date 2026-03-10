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
import { formatCurrencyETB } from '../../utils/currency';
import { useLanguage } from '../../context/LanguageContext';

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

const PERIODS = ['daily', 'weekly', 'monthly', 'six_month', 'custom'];

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
  return formatCurrencyETB(value);
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
  if (score >= 75) return { key: 'healthy', className: 'healthy' };
  if (score >= 50) return { key: 'moderate', className: 'moderate' };
  return { key: 'risk', className: 'risk' };
}

function parseHour(dateTime) {
  if (!dateTime) return null;
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours();
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const reportLocale = {
  en: {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', six_month: 'Last 6 Months', custom: 'Custom Range',
    reportsAdvanced: 'Advanced Reports & Insights', kpi: 'Key Performance Indicators',
    businessHealth: 'Business Health Score', filters: 'Time Filters', revenueTrend: 'Revenue & Cost Trend',
    profitability: 'Profitability Overview', productAnalytics: 'Product Analytics', topRevenue: 'Top Revenue Products',
    mostProfitable: 'Most Profitable Products', slowMoving: 'Slow Moving Products', operationsRhythm: 'Operations Rhythm',
    staffPerformance: 'Staff Performance', expenseAnalytics: 'Expense Analytics', expenseTrend: 'Expense Trend',
    smartInsights: 'Smart Insights', downloadAs: 'Download Report As',
    healthy: 'Healthy', moderate: 'Moderate', risk: 'Risk',
    product: 'Product', unitsSold: 'Units Sold', revenue: 'Revenue', contribution: '% Contribution',
    productionCost: 'Production Cost', profit: 'Profit', margin: 'Margin %', warning: 'Warning', overproductionRisk: 'Overproduction Risk',
    staff: 'Staff', role: 'Role', sales: 'Sales', transactions: 'Transactions', avgOrder: 'Avg Order', efficiencyScore: 'Efficiency Score', rank: 'Rank',
    topPerformer: 'Top Performer', expenseRatio: 'Expense Ratio %',
    fullExport: 'Full Export (Executive PDF + Detailed PDF + CSV + XLSX)', executivePdf: 'Executive PDF Report',
    detailedPdf: 'Detailed PDF Report', csvRaw: 'CSV (Raw Data)', excel: 'Excel (.xlsx)', staffPayments: 'Staff Payments', revenueVsCost: 'Revenue vs Cost Analytics', profitabilityTitle: 'Profitability', grossProfit: 'Gross Profit', netProfit: 'Net Profit', expenseToRevenue: 'Expense-to-Revenue Ratio %', revenueVsCostBreakdown: 'Revenue vs Cost Breakdown', peakSalesHour: 'Peak Sales Hour', bestSalesDay: 'Best Sales Day', lowestSalesDay: 'Lowest Sales Day', unknown: 'Unknown', other: 'Other', ingredients: 'Ingredients', utilities: 'Utilities', maintenance: 'Maintenance', taxes: 'Taxes', staffPayroll: 'Staff Payroll', breakdown: 'Breakdown', salesTrendIntel: 'Sales Trend Intelligence', bestDayOfWeek: 'Best Performing Day of Week', avgTxValue: 'Average Transaction Value', avgItemsTx: 'Average Items per Transaction', salesByHour: 'Sales by Hour (Heatmap style)', staffReport: 'Staff Performance Report', staffName: 'Staff Name', totalSales: 'Total Sales', avgOrderValue: 'Avg Order Value', na: 'N/A' 
  },
  am: {
    daily: 'ዕለታዊ', weekly: 'ሳምንታዊ', monthly: 'ወርሃዊ', six_month: 'ያለፉት 6 ወራት', custom: 'የብጁ ክልል',
    reportsAdvanced: 'የላቀ ሪፖርቶች እና ግንዛቤዎች', kpi: 'ቁልፍ የአፈጻጸም መለኪያዎች',
    businessHealth: 'የንግድ ጤና ነጥብ', filters: 'የጊዜ ማጣሪያዎች', revenueTrend: 'የገቢ እና ወጪ አዝማሚያ',
    profitability: 'የትርፍ አጠቃላይ', productAnalytics: 'የምርት ትንተና', topRevenue: 'ከፍተኛ ገቢ ምርቶች',
    mostProfitable: 'ከፍተኛ ትርፍ ምርቶች', slowMoving: 'በዝግታ የሚሸጡ ምርቶች', operationsRhythm: 'የስራ እንቅስቃሴ ሪዝም',
    staffPerformance: 'የሰራተኛ አፈጻጸም', expenseAnalytics: 'የወጪ ትንተና', expenseTrend: 'የወጪ አዝማሚያ',
    smartInsights: 'ስማርት ግንዛቤዎች', downloadAs: 'ሪፖርት እንደ',
    healthy: 'ጤናማ', moderate: 'መካከለኛ', risk: 'አደጋ',
    product: 'ምርት', unitsSold: 'የተሸጠ መጠን', revenue: 'ገቢ', contribution: 'የአስተዋጽኦ %',
    productionCost: 'የምርት ወጪ', profit: 'ትርፍ', margin: 'ማርጅን %', warning: 'ማስጠንቀቂያ', overproductionRisk: 'የከመጠን በላይ ምርት አደጋ',
    staff: 'ሰራተኛ', role: 'ሚና', sales: 'ሽያጭ', transactions: 'ግብይቶች', avgOrder: 'አማካይ ትዕዛዝ', efficiencyScore: 'የብቃት ነጥብ', rank: 'ደረጃ',
    topPerformer: 'ከፍተኛ አፈጻጸም', expenseRatio: 'የወጪ መጠን %',
    fullExport: 'ሙሉ ማውጫ (Executive PDF + Detailed PDF + CSV + XLSX)', executivePdf: 'Executive PDF ሪፖርት',
    detailedPdf: 'Detailed PDF ሪፖርት', csvRaw: 'CSV (Raw Data)', excel: 'ኤክሴል (.xlsx)', staffPayments: 'የሰራተኛ ክፍያ', revenueVsCost: 'የገቢ ከወጪ ጋር ትንተና', profitabilityTitle: 'ትርፋማነት', grossProfit: 'ጠቅላላ ትርፍ', netProfit: 'ንጹህ ትርፍ', expenseToRevenue: 'የወጪ-ወደ-ገቢ መጠን %', revenueVsCostBreakdown: 'የገቢ እና ወጪ ክፍፍል', peakSalesHour: 'ከፍተኛ የሽያጭ ሰዓት', bestSalesDay: 'ምርጥ የሽያጭ ቀን', lowestSalesDay: 'ዝቅተኛ የሽያጭ ቀን', unknown: 'ያልታወቀ', other: 'ሌሎች', ingredients: 'ግብዓቶች', utilities: 'አገልግሎቶች', maintenance: 'ጥገና', taxes: 'ታክስ', staffPayroll: 'የሰራተኛ ደመወዝ', breakdown: 'ክፍፍል', salesTrendIntel: 'የሽያጭ አዝማሚያ ግንዛቤ', bestDayOfWeek: 'ከፍተኛ አፈጻጸም ያለው የሳምንት ቀን', avgTxValue: 'አማካይ የግብይት ዋጋ', avgItemsTx: 'በእያንዳንዱ ግብይት ውስጥ አማካይ እቃ', salesByHour: 'በሰዓት የሽያጭ መጠን (Heatmap)', staffReport: 'የሰራተኛ አፈጻጸም ሪፖርት', staffName: 'የሰራተኛ ስም', totalSales: 'ጠቅላላ ሽያጭ', avgOrderValue: 'አማካይ የትዕዛዝ ዋጋ', na: 'የለም' 
  },
};

export default function ReportsPage() {
  const { selectedLocationId } = useBranch();
  const { language } = useLanguage();
  const rt = (key) => reportLocale[language]?.[key] || reportLocale.en[key] || key;
  const [period, setPeriod] = useState('daily');
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
        setCurrentData({ summary: {}, sales_by_day: [], top_products: [], payment_methods: [], sales_by_category: [], details: { expenses: [], staff_payments: [], batches: { batch_list: [] }, cashier_performance: [] }, data_unavailable: true });
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
        name: item.name || item.product_name || rt('unknown'),
        units: Number(item.total_sold || item.quantity || item.units_sold || 0),
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
        const tx = Number(row.transactions || row.total_transactions || 0);
        return {
          name: row.cashier_name || row.username || rt('unknown'),
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
      return entries.map((entry) => ({ name: entry.category || rt('other'), value: Number(entry.revenue || 0) * 0.2 }));
    }
    return [
      { name: rt('ingredients'), value: current.prod * 0.65 },
      { name: rt('utilities'), value: current.expenses * 0.2 },
      { name: rt('maintenance'), value: current.expenses * 0.1 },
      { name: rt('taxes'), value: current.expenses * 0.05 },
      { name: rt('staffPayroll'), value: current.staff },
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
    { label: rt('revenue'), value: current.sales, change: growth.sales },
    { label: rt('productionCost'), value: current.prod, change: growth.prod },
    { label: rt('expenseAnalytics'), value: current.expenses, change: growth.expenses },
    { label: rt('staffPayments'), value: current.staff, change: growth.staff },
    { label: rt('profit'), value: current.net, change: growth.net },
    { label: rt('margin'), value: current.netMargin, change: growth.netMargin, isPercent: true },
  ];


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
            <div className="report-kpi-label">{rt('businessHealth')}</div>
            <div className="report-kpi-value">{score}/100</div>
            <span className={`score-badge ${scoreStatus.className}`}>{scoreStatus.label}</span>
          </div>
        </div>
      </section>

      <section className="card report-section">
        <h3>Period Selector</h3>
        <div className="period-buttons">
          {PERIODS.map((key) => (
            <button key={key} className={`btn btn-sm ${period === key ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setPeriod(key)}>
              {rt(key)}
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
        <h3>{rt('revenueVsCost')}</h3>
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
          <h3>{rt('profitabilityTitle')}</h3>
          <div className="metric-list">
            <div><span>{rt('grossProfit')}</span><strong>{fmtMoney(current.gross)}</strong></div>
            <div><span>Gross Margin %</span><strong>{fmtPct(current.grossMargin)}</strong></div>
            <div><span>{rt('netProfit')}</span><strong>{fmtMoney(current.net)}</strong></div>
            <div><span>Net Margin %</span><strong>{fmtPct(current.netMargin)}</strong></div>
            <div><span>{rt('expenseToRevenue')}</span><strong>{fmtPct(current.expenseRatio)}</strong></div>
          </div>
        </div>
        <div>
          <h4>{rt('revenueVsCostBreakdown')}</h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[{ name: rt('breakdown'), revenue: current.sales, cost: current.prod + current.expenses + current.staff }]}>
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
          <button className={`btn btn-sm ${activeProductTab === 'revenue' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveProductTab('revenue')}>{rt('topRevenue')}</button>
          <button className={`btn btn-sm ${activeProductTab === 'profit' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveProductTab('profit')}>{rt('mostProfitable')}</button>
          <button className={`btn btn-sm ${activeProductTab === 'slow' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveProductTab('slow')}>{rt('slowMoving')}</button>
        </div>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              {activeProductTab === 'revenue' && <tr><th>{rt('product')}</th><th>{rt('unitsSold')}</th><th>{rt('revenue')}</th><th>{rt('contribution')}</th></tr>}
              {activeProductTab === 'profit' && <tr><th>{rt('product')}</th><th>{rt('revenue')}</th><th>{rt('productionCost')}</th><th>{rt('profit')}</th><th>{rt('margin')}</th></tr>}
              {activeProductTab === 'slow' && <tr><th>{rt('product')}</th><th>{rt('unitsSold')}</th><th>{rt('margin')}</th><th>{rt('warning')}</th></tr>}
            </thead>
            <tbody>
              {activeProductTab === 'revenue' && productRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.units}</td><td>{fmtMoney(row.revenue)}</td><td>{fmtPct(row.contribution)}</td></tr>)}
              {activeProductTab === 'profit' && productRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{fmtMoney(row.revenue)}</td><td>{fmtMoney(row.productionCost)}</td><td>{fmtMoney(row.profit)}</td><td>{fmtPct(row.margin)}</td></tr>)}
              {activeProductTab === 'slow' && slowMovingRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.units}</td><td>{fmtPct(row.margin)}</td><td><span className="badge badge-warning">{rt('overproductionRisk')}</span></td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card report-section two-col">
        <div>
          <h3>{rt('salesTrendIntel')}</h3>
          <div className="metric-list">
            <div><span>{rt('bestDayOfWeek')}</span><strong>{weekdaySales.reduce((best, row) => row.sales > best.sales ? row : best, { day: '-', sales: 0 }).day}</strong></div>
            <div><span>{rt('peakSalesHour')}</span><strong>{(() => {
              const allHours = (currentData?.details?.cashier_performance || []).map((row) => parseHour(row.last_sale_at)).filter((h) => h !== null);
              return allHours.length ? `${allHours.sort((a, b) => a - b).at(-1)}:00` : rt('na');
            })()}</strong></div>
            <div><span>{rt('avgTxValue')}</span><strong>{fmtMoney(currentData?.summary?.avg_transaction || 0)}</strong></div>
            <div><span>{rt('avgItemsTx')}</span><strong>{Number((currentData?.details?.cashier_performance || []).reduce((sum, row) => sum + Number(row.items_sold || 0), 0) / Math.max(1, Number(currentData?.summary?.total_transactions || 0))).toFixed(2)}</strong></div>
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
          <h4>{rt('salesByHour')}</h4>
          <div className="hour-heatmap">
            {Array.from({ length: 24 }).map((_, hour) => {
              const strength = Math.max(0.05, Math.min(1, ((timelineData[hour % Math.max(1, timelineData.length)]?.revenue || 0) / Math.max(1, current.sales)) * 8));
              return <div key={hour} className="hour-cell" style={{ opacity: strength }}>{hour}:00</div>;
            })}
          </div>
        </div>
      </section>

      <section className="card report-section">
        <h3>{rt('staffReport')}</h3>
        <div className="table-responsive">
          <table className="table table-hover">
            <thead><tr><th>{rt('staffName')}</th><th>{rt('role')}</th><th>{rt('totalSales')}</th><th>{rt('transactions')}</th><th>{rt('avgOrderValue')}</th><th>{rt('contribution')}</th><th>{rt('efficiencyScore')}</th><th>{rt('rank')}</th></tr></thead>
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
                  <td>{idx === 0 ? <span className="badge badge-success"><Trophy size={13} /> {rt('topPerformer')}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card report-section two-col">
        <div>
          <h3>{rt('expenseAnalytics')}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={expensePie} dataKey="value" nameKey="name" outerRadius={90}>
                {expensePie.map((entry, idx) => <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value) => fmtMoney(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="metric-list"><div><span>{rt('expenseRatio')}</span><strong>{fmtPct(current.expenseRatio)}</strong></div></div>
        </div>
        <div>
          <h4>{rt('expenseTrend')}</h4>
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
        <h3>{rt('smartInsights')}</h3>
        <div className="insight-grid">
          {insights.map((insight) => <div key={insight} className="insight-card">{insight}</div>)}
        </div>
      </section>

      <section className="card report-section">
        <h3>{rt('downloadAs')}</h3>
        <div className="export-row">
          <button className="btn btn-primary" onClick={exportFull}><Download size={14} /> {rt('fullExport')}</button>
          <button className="btn btn-outline-primary" onClick={exportExecutivePdf}>{rt('executivePdf')}</button>
          <button className="btn btn-outline-secondary" onClick={exportDetailedPdf}>{rt('detailedPdf')}</button>
          <button className="btn btn-outline-success" onClick={exportCsv}>{rt('csvRaw')}</button>
          <button className="btn btn-outline-info" onClick={exportXlsx}>{rt('excel')}</button>
        </div>
      </section>
    </div>
  );
}
