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
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarRange, Download, Lightbulb, Package, Sparkles, Target, Trophy, Users, Wallet } from 'lucide-react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { createPdfBlob, createXlsxBlob } from '../../utils/reportExportGenerators';
import './Reports.css';
import { formatCurrencyETB } from '../../utils/currency';
import { useLanguage } from '../../context/LanguageContext';
import { buildExpenseBreakdown, buildProductRows, buildSalesByHour, buildTimelineData, getPeakSalesHourLabel } from './reportAnalytics';

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

function formatDisplayDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return '-';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, options);
}

function buildSummary(data) {
  const sales = Number(data?.summary?.total_sales || 0);
  const expenses = Number(data?.summary?.total_expenses || 0);
  const staff = Number(data?.summary?.total_staff_payments || data?.staff_payments?.total_staff_payments || 0);
  const prod = Number(data?.summary?.total_batch_costs || data?.costs?.batch_costs || 0);
  const waste = Number(data?.summary?.total_waste_loss || data?.waste?.total_waste_loss || data?.costs?.waste_loss || 0);
  const net = Number(data?.summary?.net_profit || data?.profit?.net_profit || (sales - prod - expenses - staff - waste));
  const gross = sales - prod;
  const grossMargin = sales > 0 ? (gross / sales) * 100 : 0;
  const netMargin = sales > 0 ? (net / sales) * 100 : 0;
  const expenseRatio = sales > 0 ? ((expenses + staff + waste) / sales) * 100 : 0;
  return { sales, expenses, staff, prod, waste, net, gross, grossMargin, netMargin, expenseRatio };
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
    daily: 'á‹•áˆˆá‰³á‹Š', weekly: 'áˆ³áˆáŠ•á‰³á‹Š', monthly: 'á‹ˆáˆ­áˆƒá‹Š', six_month: 'á‹«áˆˆá‰á‰µ 6 á‹ˆáˆ«á‰µ', custom: 'á‹¨á‰¥áŒ áŠ­áˆáˆ',
    reportsAdvanced: 'á‹¨áˆ‹á‰€ áˆªá–áˆ­á‰¶á‰½ áŠ¥áŠ“ áŒáŠ•á‹›á‰¤á‹Žá‰½', kpi: 'á‰áˆá á‹¨áŠ áˆáŒ»áŒ¸áˆ áˆ˜áˆˆáŠªá‹«á‹Žá‰½',
    businessHealth: 'á‹¨áŠ•áŒá‹µ áŒ¤áŠ“ áŠáŒ¥á‰¥', filters: 'á‹¨áŒŠá‹œ áˆ›áŒ£áˆªá‹«á‹Žá‰½', revenueTrend: 'á‹¨áŒˆá‰¢ áŠ¥áŠ“ á‹ˆáŒª áŠ á‹áˆ›áˆšá‹«',
    profitability: 'á‹¨á‰µáˆ­á áŠ áŒ á‰ƒáˆ‹á‹­', productAnalytics: 'á‹¨áˆáˆ­á‰µ á‰µáŠ•á‰°áŠ“', topRevenue: 'áŠ¨áá‰°áŠ› áŒˆá‰¢ áˆáˆ­á‰¶á‰½',
    mostProfitable: 'áŠ¨áá‰°áŠ› á‰µáˆ­á áˆáˆ­á‰¶á‰½', slowMoving: 'á‰ á‹áŒá‰³ á‹¨áˆšáˆ¸áŒ¡ áˆáˆ­á‰¶á‰½', operationsRhythm: 'á‹¨áˆµáˆ« áŠ¥áŠ•á‰…áˆµá‰ƒáˆ´ áˆªá‹áˆ',
    staffPerformance: 'á‹¨áˆ°áˆ«á‰°áŠ› áŠ áˆáŒ»áŒ¸áˆ', expenseAnalytics: 'á‹¨á‹ˆáŒª á‰µáŠ•á‰°áŠ“', expenseTrend: 'á‹¨á‹ˆáŒª áŠ á‹áˆ›áˆšá‹«',
    smartInsights: 'áˆµáˆ›áˆ­á‰µ áŒáŠ•á‹›á‰¤á‹Žá‰½', downloadAs: 'áˆªá–áˆ­á‰µ áŠ¥áŠ•á‹°',
    healthy: 'áŒ¤áŠ“áˆ›', moderate: 'áˆ˜áŠ«áŠ¨áˆˆáŠ›', risk: 'áŠ á‹°áŒ‹',
    product: 'áˆáˆ­á‰µ', unitsSold: 'á‹¨á‰°áˆ¸áŒ  áˆ˜áŒ áŠ•', revenue: 'áŒˆá‰¢', contribution: 'á‹¨áŠ áˆµá‰°á‹‹áŒ½áŠ¦ %',
    productionCost: 'á‹¨áˆáˆ­á‰µ á‹ˆáŒª', profit: 'á‰µáˆ­á', margin: 'áˆ›áˆ­áŒ…áŠ• %', warning: 'áˆ›áˆµáŒ áŠ•á‰€á‰‚á‹«', overproductionRisk: 'á‹¨áŠ¨áˆ˜áŒ áŠ• á‰ áˆ‹á‹­ áˆáˆ­á‰µ áŠ á‹°áŒ‹',
    staff: 'áˆ°áˆ«á‰°áŠ›', role: 'áˆšáŠ“', sales: 'áˆ½á‹«áŒ­', transactions: 'áŒá‰¥á‹­á‰¶á‰½', avgOrder: 'áŠ áˆ›áŠ«á‹­ á‰µá‹•á‹›á‹', efficiencyScore: 'á‹¨á‰¥á‰ƒá‰µ áŠáŒ¥á‰¥', rank: 'á‹°áˆ¨áŒƒ',
    topPerformer: 'áŠ¨áá‰°áŠ› áŠ áˆáŒ»áŒ¸áˆ', expenseRatio: 'á‹¨á‹ˆáŒª áˆ˜áŒ áŠ• %',
    fullExport: 'áˆ™áˆ‰ áˆ›á‹áŒ« (Executive PDF + Detailed PDF + CSV + XLSX)', executivePdf: 'Executive PDF áˆªá–áˆ­á‰µ',
    detailedPdf: 'Detailed PDF áˆªá–áˆ­á‰µ', csvRaw: 'CSV (Raw Data)', excel: 'áŠ¤áŠ­áˆ´áˆ (.xlsx)', staffPayments: 'á‹¨áˆ°áˆ«á‰°áŠ› áŠ­áá‹«', revenueVsCost: 'á‹¨áŒˆá‰¢ áŠ¨á‹ˆáŒª áŒ‹áˆ­ á‰µáŠ•á‰°áŠ“', profitabilityTitle: 'á‰µáˆ­á‹áˆ›áŠá‰µ', grossProfit: 'áŒ á‰…áˆ‹áˆ‹ á‰µáˆ­á', netProfit: 'áŠ•áŒ¹áˆ… á‰µáˆ­á', expenseToRevenue: 'á‹¨á‹ˆáŒª-á‹ˆá‹°-áŒˆá‰¢ áˆ˜áŒ áŠ• %', revenueVsCostBreakdown: 'á‹¨áŒˆá‰¢ áŠ¥áŠ“ á‹ˆáŒª áŠ­áááˆ', peakSalesHour: 'áŠ¨áá‰°áŠ› á‹¨áˆ½á‹«áŒ­ áˆ°á‹“á‰µ', bestSalesDay: 'áˆáˆ­áŒ¥ á‹¨áˆ½á‹«áŒ­ á‰€áŠ•', lowestSalesDay: 'á‹á‰…á‰°áŠ› á‹¨áˆ½á‹«áŒ­ á‰€áŠ•', unknown: 'á‹«áˆá‰³á‹ˆá‰€', other: 'áˆŒáˆŽá‰½', ingredients: 'áŒá‰¥á‹“á‰¶á‰½', utilities: 'áŠ áŒˆáˆáŒáˆŽá‰¶á‰½', maintenance: 'áŒ¥áŒˆáŠ“', taxes: 'á‰³áŠ­áˆµ', staffPayroll: 'á‹¨áˆ°áˆ«á‰°áŠ› á‹°áˆ˜á‹ˆá‹', breakdown: 'áŠ­áááˆ', salesTrendIntel: 'á‹¨áˆ½á‹«áŒ­ áŠ á‹áˆ›áˆšá‹« áŒáŠ•á‹›á‰¤', bestDayOfWeek: 'áŠ¨áá‰°áŠ› áŠ áˆáŒ»áŒ¸áˆ á‹«áˆˆá‹ á‹¨áˆ³áˆáŠ•á‰µ á‰€áŠ•', avgTxValue: 'áŠ áˆ›áŠ«á‹­ á‹¨áŒá‰¥á‹­á‰µ á‹‹áŒ‹', avgItemsTx: 'á‰ áŠ¥á‹«áŠ•á‹³áŠ•á‹± áŒá‰¥á‹­á‰µ á‹áˆµáŒ¥ áŠ áˆ›áŠ«á‹­ áŠ¥á‰ƒ', salesByHour: 'á‰ áˆ°á‹“á‰µ á‹¨áˆ½á‹«áŒ­ áˆ˜áŒ áŠ• (Heatmap)', staffReport: 'á‹¨áˆ°áˆ«á‰°áŠ› áŠ áˆáŒ»áŒ¸áˆ áˆªá–áˆ­á‰µ', staffName: 'á‹¨áˆ°áˆ«á‰°áŠ› áˆµáˆ', totalSales: 'áŒ á‰…áˆ‹áˆ‹ áˆ½á‹«áŒ­', avgOrderValue: 'áŠ áˆ›áŠ«á‹­ á‹¨á‰µá‹•á‹›á‹ á‹‹áŒ‹', na: 'á‹¨áˆˆáˆ'
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
  const [profitabilityRows, setProfitabilityRows] = useState([]);

  const selectedRange = useMemo(() => rangeFromPeriod(period, customRange), [period, customRange]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const currentReq = api.get(`/reports/weekly?start_date=${selectedRange.startDate}&end_date=${selectedRange.endDate}`);
        const prev = prevRange(selectedRange);
        const prevReq = api.get(`/reports/weekly?start_date=${prev.startDate}&end_date=${prev.endDate}`);
        const profitabilityReq = api.get(`/reports/products/profitability?start_date=${selectedRange.startDate}&end_date=${selectedRange.endDate}`);
        const [currRes, prevRes, profitabilityRes] = await Promise.all([currentReq, prevReq, profitabilityReq]);
        setCurrentData(currRes.data || null);
        setPreviousData(prevRes.data || null);
        setProfitabilityRows(profitabilityRes.data || []);
      } catch (err) {
        console.error('Failed to load reports:', err);
        setCurrentData({ summary: {}, sales_by_day: [], sales_by_hour: [], top_products: [], payment_methods: [], sales_by_category: [], details: { expenses: [], staff_payments: [], waste: [], batches: { batch_list: [] }, cashier_performance: [] }, data_unavailable: true });
        setPreviousData({ summary: {}, sales_by_day: [] });
        setProfitabilityRows([]);
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
  const timelineData = useMemo(() => buildTimelineData(currentData), [currentData]);
  const productRows = useMemo(() => buildProductRows(profitabilityRows, currentData?.top_products || []), [profitabilityRows, currentData]);
  const slowMovingRows = useMemo(() => productRows.filter((row) => row.units <= 5 || row.margin < 20), [productRows]);

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
  }, [currentData, rt]);

  const expensePie = useMemo(() => buildExpenseBreakdown(currentData, {
    ingredients: rt('ingredients'),
    utilities: rt('utilities'),
    maintenance: rt('maintenance'),
    taxes: rt('taxes'),
    staffPayroll: rt('staffPayroll'),
    wasteLoss: 'Waste Loss',
    productionCost: rt('productionCost'),
    other: rt('other'),
  }), [currentData, rt]);

  const salesByHour = useMemo(() => buildSalesByHour(currentData), [currentData]);

  const insights = useMemo(() => {
    const bestWeekDay = weekdaySales.reduce((best, row) => (row.sales > best.sales ? row : best), { day: '-', sales: 0 });
    const topProduct = productRows[0];
    const topPayMethod = [...(currentData?.payment_methods || [])].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0];
    return [
      `Revenue ${growth.sales >= 0 ? 'increased' : 'decreased'} by ${fmtPct(Math.abs(growth.sales))} vs previous period.`,
      `Net margin is ${fmtPct(current.netMargin)} with business health score ${score}/100.`,
      `${topProduct ? topProduct.name : 'Top product'} contributes ${fmtPct(topProduct?.contribution || 0)} of tracked top-product revenue.`,
      `${topPayMethod?.payment_method || 'Top payment method'} dominates with ${fmtMoney(topPayMethod?.total || 0)}.`,
      `${bestWeekDay.day} is the strongest sales day in this period.`,
      `${getPeakSalesHourLabel(currentData, rt('na'))} is the strongest sales hour based on recorded sales totals.`,
    ];
  }, [currentData, current.netMargin, growth.sales, productRows, rt, score, weekdaySales]);

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
      `waste_loss: ${current.waste.toFixed(2)}`,
      `net_profit: ${current.net.toFixed(2)}`,
      `net_margin: ${current.netMargin.toFixed(2)}%`,
      `health_score: ${score}/100 (${scoreStatus.key})`,
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
      ['waste_loss', current.waste],
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
    { label: rt('revenue'), value: current.sales, change: growth.sales, icon: Wallet, tone: 'revenue' },
    { label: rt('productionCost'), value: current.prod, change: growth.prod, icon: Package, tone: 'production' },
    { label: rt('expenseAnalytics'), value: current.expenses, change: growth.expenses, icon: Lightbulb, tone: 'expense' },
    { label: rt('staffPayments'), value: current.staff, change: growth.staff, icon: Users, tone: 'staff' },
    { label: 'Waste Loss', value: current.waste, change: percentChange(current.waste, previous.waste), icon: AlertTriangle, tone: 'waste' },
    { label: rt('profit'), value: current.net, change: growth.net, icon: Activity, tone: 'profit' },
    { label: rt('margin'), value: current.netMargin, change: growth.netMargin, isPercent: true, icon: Target, tone: 'margin' },
  ];
  const scoreLabel = rt(scoreStatus.key);
  const topWeekday = weekdaySales.reduce((best, row) => (row.sales > best.sales ? row : best), { day: '-', sales: 0 });
  const topStaff = staffRows[0] || null;
  const dominantExpense = expensePie.reduce((best, row) => (row.value > best.value ? row : best), { name: rt('other'), value: 0 });
  const peakHourLabel = getPeakSalesHourLabel(currentData, rt('na'));
  const averageItemsPerTransaction = Number((currentData?.details?.cashier_performance || []).reduce((sum, row) => sum + Number(row.items_sold || 0), 0) / Math.max(1, Number(currentData?.summary?.total_transactions || 0))).toFixed(2);
  const totalOperatingCost = current.prod + current.expenses + current.staff + current.waste;
  const rangeDays = Math.max(1, Math.round((new Date(selectedRange.endDate).getTime() - new Date(selectedRange.startDate).getTime()) / 86400000) + 1);
  const rangeLabel = `${formatDisplayDate(selectedRange.startDate)} - ${formatDisplayDate(selectedRange.endDate)}`;
  const periodDescriptor = period === 'daily'
    ? 'A sharp one-day read of sales, costs, and operational rhythm.'
    : period === 'weekly'
      ? 'A rolling seven-day pulse that highlights momentum and drag.'
      : period === 'monthly'
        ? 'A month-to-date view built for management decisions and trend checks.'
        : period === 'six_month'
          ? 'A long-range performance canvas for spotting structural patterns.'
          : 'A custom deep dive shaped around the exact window you need.';
  const heroSignals = [
    { label: rt('businessHealth'), value: `${score}/100`, meta: scoreLabel, icon: Sparkles, tone: 'score' },
    { label: rt('bestDayOfWeek'), value: topWeekday.day, meta: fmtMoney(topWeekday.sales), icon: Target, tone: 'momentum' },
    { label: rt('peakSalesHour'), value: peakHourLabel, meta: `${Number(currentData?.summary?.total_transactions || 0)} tx`, icon: Activity, tone: 'timing' },
    { label: rt('topPerformer'), value: topStaff?.name || rt('na'), meta: topStaff ? fmtMoney(topStaff.sales) : rt('na'), icon: Trophy, tone: 'staff' },
  ];
  const exportActions = [
    { label: rt('fullExport'), meta: 'Everything in one sweep.', onClick: exportFull, variant: 'primary' },
    { label: rt('executivePdf'), meta: 'Board-style summary deck.', onClick: exportExecutivePdf, variant: 'secondary' },
    { label: rt('detailedPdf'), meta: 'Tables and detailed breakdown.', onClick: exportDetailedPdf, variant: 'secondary' },
    { label: rt('csvRaw'), meta: 'Raw rows for analysis.', onClick: exportCsv, variant: 'neutral' },
    { label: rt('excel'), meta: 'Spreadsheet-ready workbook.', onClick: exportXlsx, variant: 'neutral' },
  ];
  const chartAxisProps = {
    axisLine: false,
    tickLine: false,
    tick: { fill: 'var(--report-chart-tick)', fontSize: 12 },
  };
  const chartTooltipProps = {
    contentStyle: {
      borderRadius: 14,
      border: '1px solid var(--report-tooltip-border)',
      backgroundColor: 'var(--report-tooltip-bg)',
      boxShadow: 'var(--report-tooltip-shadow)',
    },
    itemStyle: { color: 'var(--report-text)' },
    labelStyle: { color: 'var(--report-text)', fontWeight: 700 },
  };
  const legendFormatter = (value) => <span style={{ color: 'var(--report-text)' }}>{value}</span>;

  return (
    <div className="report-v2">
      <section className="report-hero">
        <div className="report-hero-main">
          <div className="report-hero-copy">
            <div className="report-hero-kicker">
              <Sparkles size={14} />
              <span>{rt('reportsAdvanced')}</span>
            </div>
            <h1>{rt('reportsAdvanced')}</h1>
            <p>{periodDescriptor}</p>
            <div className="report-hero-meta">
              <span className="report-meta-pill"><CalendarRange size={14} /> {rangeLabel}</span>
              <span className="report-meta-pill"><Activity size={14} /> {rangeDays} day window</span>
              <span className="report-meta-pill"><Wallet size={14} /> {current.net >= 0 ? 'Profit ahead of costs' : 'Costs need attention'}</span>
            </div>
          </div>

          <div className="report-hero-focus">
            <div className="report-focus-head">
              <span>Current snapshot</span>
              <strong>{fmtMoney(current.net)}</strong>
              <small>{fmtPct(current.netMargin)} net margin</small>
            </div>
            <div className="report-focus-list">
              <div><span>{rt('revenue')}</span><strong>{fmtMoney(current.sales)}</strong></div>
              <div><span>Total operating cost</span><strong>{fmtMoney(totalOperatingCost)}</strong></div>
              <div><span>Largest cost lane</span><strong>{dominantExpense.name}</strong></div>
            </div>
          </div>
        </div>

        <div className="report-signal-grid">
          {heroSignals.map((signal) => {
            const Icon = signal.icon;
            return (
              <article key={signal.label} className={`report-signal-card tone-${signal.tone}`}>
                <div className="report-signal-icon"><Icon size={18} /></div>
                <div className="report-signal-content">
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                  <small>{signal.meta}</small>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="report-toolbar-band">
        <div className="report-section-head">
          <div>
            <span className="report-section-kicker">{rt('filters')}</span>
            <h2>Shape the reporting window</h2>
          </div>
          <p>Move from quick snapshots to long-range reviews without changing the data source underneath.</p>
        </div>

        <div className="report-chip-group">
          {PERIODS.map((key) => (
            <button
              key={key}
              type="button"
              className={`report-chip ${period === key ? 'active' : ''}`}
              onClick={() => setPeriod(key)}
            >
              {rt(key)}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="report-date-fields">
            <label className="report-date-field">
              <span>Start</span>
              <input type="date" className="form-control" value={customRange.startDate} onChange={(e) => setCustomRange((prev) => ({ ...prev, startDate: e.target.value }))} />
            </label>
            <label className="report-date-field">
              <span>End</span>
              <input type="date" className="form-control" value={customRange.endDate} onChange={(e) => setCustomRange((prev) => ({ ...prev, endDate: e.target.value }))} />
            </label>
          </div>
        )}
      </section>

      <section className="report-section">
        <div className="report-section-head">
          <div>
            <span className="report-section-kicker">{rt('kpi')}</span>
            <h3>Executive business summary</h3>
          </div>
          <p>Each metric compares the selected window against the immediately previous one.</p>
        </div>

        <div className="report-kpi-grid">
          {kpis.map((kpi) => {
            const positive = kpi.change >= 0;
            const Icon = kpi.icon;
            return (
              <article key={kpi.label} className={`report-kpi-card tone-${kpi.tone}`}>
                <div className="report-kpi-icon"><Icon size={18} /></div>
                <div className="report-kpi-label">{kpi.label}</div>
                <div className="report-kpi-value">{kpi.isPercent ? fmtPct(kpi.value) : fmtMoney(kpi.value)}</div>
                <div className={`report-kpi-change ${positive ? 'positive' : 'negative'}`}>
                  {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  <span>{fmtPct(Math.abs(kpi.change))}</span>
                </div>
              </article>
            );
          })}

          <article className="report-kpi-card report-kpi-card--score" title="Weighted formula: 45% net margin + 35% expense ratio + 20% growth rate">
            <div className="report-kpi-label">{rt('businessHealth')}</div>
            <div className="report-kpi-value">{score}/100</div>
            <span className={`score-badge ${scoreStatus.className}`}>{scoreLabel}</span>
            <p>Weighted from profitability, cost pressure, and growth direction.</p>
          </article>
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-head">
          <div>
            <span className="report-section-kicker">{rt('revenueTrend')}</span>
            <h3>{rt('revenueVsCost')}</h3>
          </div>
          <p>The storyline chart keeps revenue, operating drag, and net result on the same frame.</p>
        </div>

        <div className="report-story-metrics">
          <div><span>{rt('revenue')}</span><strong>{fmtMoney(current.sales)}</strong></div>
          <div><span>Total operating cost</span><strong>{fmtMoney(totalOperatingCost)}</strong></div>
          <div><span>{rt('netProfit')}</span><strong>{fmtMoney(current.net)}</strong></div>
        </div>

        <div className="report-chart-shell">
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={timelineData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="var(--report-grid)" strokeDasharray="4 8" vertical={false} />
              <XAxis dataKey="label" {...chartAxisProps} />
              <YAxis {...chartAxisProps} />
              <Tooltip formatter={(value) => fmtMoney(value)} {...chartTooltipProps} />
              <Legend wrapperStyle={{ paddingTop: 14, fontSize: 12 }} formatter={legendFormatter} />
              <Line dataKey="revenue" name={rt('revenue')} stroke="#1f9d8d" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
              <Line dataKey="production_cost" name={rt('productionCost')} stroke="#f59e0b" strokeWidth={2.5} dot={false} />
              <Line dataKey="expenses" name={rt('expenseAnalytics')} stroke="#ef4444" strokeWidth={2.5} dot={false} />
              <Line dataKey="net_profit" name={rt('netProfit')} stroke="#2563eb" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="report-split-grid">
        <section className="report-section">
          <div className="report-section-head">
            <div>
              <span className="report-section-kicker">{rt('profitability')}</span>
              <h3>{rt('profitabilityTitle')}</h3>
            </div>
            <p>A compact read on how much revenue survives production, waste, and operating spend.</p>
          </div>

          <div className="metric-list">
            <div><span>{rt('grossProfit')}</span><strong>{fmtMoney(current.gross)}</strong></div>
            <div><span>Gross Margin %</span><strong>{fmtPct(current.grossMargin)}</strong></div>
            <div><span>Waste Loss</span><strong>{fmtMoney(current.waste)}</strong></div>
            <div><span>{rt('netProfit')}</span><strong>{fmtMoney(current.net)}</strong></div>
            <div><span>Net Margin %</span><strong>{fmtPct(current.netMargin)}</strong></div>
            <div><span>{rt('expenseToRevenue')}</span><strong>{fmtPct(current.expenseRatio)}</strong></div>
          </div>

          <div className="report-chart-shell report-chart-shell--compact">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={[{ name: rt('breakdown'), revenue: current.sales, cost: totalOperatingCost }]} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--report-grid)" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="name" {...chartAxisProps} />
                <YAxis {...chartAxisProps} />
                <Tooltip formatter={(value) => fmtMoney(value)} {...chartTooltipProps} />
                <Legend wrapperStyle={{ paddingTop: 14, fontSize: 12 }} formatter={legendFormatter} />
                <Bar dataKey="revenue" name={rt('revenue')} fill="#1f9d8d" radius={[10, 10, 0, 0]} />
                <Bar dataKey="cost" name="Cost" fill="#fb7185" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <div>
              <span className="report-section-kicker">{rt('operationsRhythm')}</span>
              <h3>{rt('salesTrendIntel')}</h3>
            </div>
            <p>Find the strongest selling day, peak hour, and transaction behavior in one place.</p>
          </div>

          <div className="metric-list">
            <div><span>{rt('bestDayOfWeek')}</span><strong>{topWeekday.day}</strong></div>
            <div><span>{rt('peakSalesHour')}</span><strong>{peakHourLabel}</strong></div>
            <div><span>{rt('avgTxValue')}</span><strong>{fmtMoney(currentData?.summary?.avg_transaction || 0)}</strong></div>
            <div><span>{rt('avgItemsTx')}</span><strong>{averageItemsPerTransaction}</strong></div>
          </div>

          <div className="report-chart-shell report-chart-shell--compact">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekdaySales} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--report-grid)" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="day" {...chartAxisProps} />
                <YAxis {...chartAxisProps} />
                <Tooltip formatter={(value) => fmtMoney(value)} {...chartTooltipProps} />
                <Bar dataKey="sales" name={rt('sales')} fill="#2563eb" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="report-subhead">
            <h4>{rt('salesByHour')}</h4>
          </div>
          <div className="hour-heatmap">
            {salesByHour.map((row) => {
              const strength = Math.max(0.12, Math.min(1, row.sales / Math.max(1, current.sales)));
              return <div key={row.hour} className="hour-cell" style={{ opacity: strength }} title={`${String(row.hour).padStart(2, '0')}:00 | ${fmtMoney(row.sales)}`}>{String(row.hour).padStart(2, '0')}:00</div>;
            })}
          </div>
        </section>
      </div>

      <section className="report-section">
        <div className="report-section-head">
          <div>
            <span className="report-section-kicker">{rt('productAnalytics')}</span>
            <h3>Product intelligence</h3>
          </div>
          <p>Switch between revenue leadership, profitability, and items that may be tying up production effort.</p>
        </div>

        <div className="report-chip-group report-chip-group--compact">
          <button type="button" className={`report-chip ${activeProductTab === 'revenue' ? 'active' : ''}`} onClick={() => setActiveProductTab('revenue')}>{rt('topRevenue')}</button>
          <button type="button" className={`report-chip ${activeProductTab === 'profit' ? 'active' : ''}`} onClick={() => setActiveProductTab('profit')}>{rt('mostProfitable')}</button>
          <button type="button" className={`report-chip ${activeProductTab === 'slow' ? 'active' : ''}`} onClick={() => setActiveProductTab('slow')}>{rt('slowMoving')}</button>
        </div>

        <div className="report-table-shell table-responsive">
          <table className="table report-table">
            <thead>
              {activeProductTab === 'revenue' && <tr><th>{rt('product')}</th><th>{rt('unitsSold')}</th><th>{rt('revenue')}</th><th>{rt('contribution')}</th></tr>}
              {activeProductTab === 'profit' && <tr><th>{rt('product')}</th><th>{rt('revenue')}</th><th>{rt('productionCost')}</th><th>{rt('profit')}</th><th>{rt('margin')}</th></tr>}
              {activeProductTab === 'slow' && <tr><th>{rt('product')}</th><th>{rt('unitsSold')}</th><th>{rt('margin')}</th><th>{rt('warning')}</th></tr>}
            </thead>
            <tbody>
              {activeProductTab === 'revenue' && (
                productRows.length ? productRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.units}</td><td>{fmtMoney(row.revenue)}</td><td>{fmtPct(row.contribution)}</td></tr>) : <tr><td colSpan={4} className="report-empty-row">No product revenue data in this period.</td></tr>
              )}
              {activeProductTab === 'profit' && (
                productRows.length ? productRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{fmtMoney(row.revenue)}</td><td>{fmtMoney(row.productionCost)}</td><td>{fmtMoney(row.profit)}</td><td>{fmtPct(row.margin)}</td></tr>) : <tr><td colSpan={5} className="report-empty-row">No profitability data in this period.</td></tr>
              )}
              {activeProductTab === 'slow' && (
                slowMovingRows.length ? slowMovingRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.units}</td><td>{fmtPct(row.margin)}</td><td><span className="report-warning-pill">{rt('overproductionRisk')}</span></td></tr>) : <tr><td colSpan={4} className="report-empty-row">No slow-moving products were flagged in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-head">
          <div>
            <span className="report-section-kicker">{rt('staffPerformance')}</span>
            <h3>{rt('staffReport')}</h3>
          </div>
          <p>Cashier and front-line performance framed around sales contribution, transaction volume, and efficiency.</p>
        </div>

        <div className="report-table-shell table-responsive">
          <table className="table report-table">
            <thead><tr><th>{rt('staffName')}</th><th>{rt('role')}</th><th>{rt('totalSales')}</th><th>{rt('transactions')}</th><th>{rt('avgOrderValue')}</th><th>{rt('contribution')}</th><th>{rt('efficiencyScore')}</th><th>{rt('rank')}</th></tr></thead>
            <tbody>
              {staffRows.length ? staffRows.map((row, idx) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.role}</td>
                  <td>{fmtMoney(row.sales)}</td>
                  <td>{row.tx}</td>
                  <td>{fmtMoney(row.avgOrder)}</td>
                  <td>{fmtPct(row.contribution)}</td>
                  <td>{row.efficiency.toFixed(1)}</td>
                  <td>{idx === 0 ? <span className="report-success-pill"><Trophy size={13} /> {rt('topPerformer')}</span> : '-'}</td>
                </tr>
              )) : <tr><td colSpan={8} className="report-empty-row">No staff performance data in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="report-split-grid">
        <section className="report-section">
          <div className="report-section-head">
            <div>
              <span className="report-section-kicker">{rt('expenseAnalytics')}</span>
              <h3>{rt('expenseAnalytics')}</h3>
            </div>
            <p>Understand which operating lanes are absorbing the most value and how those costs moved over time.</p>
          </div>

          <div className="report-chart-shell report-chart-shell--compact">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={expensePie} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {expensePie.map((entry, idx) => <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => fmtMoney(value)} {...chartTooltipProps} />
                <Legend wrapperStyle={{ paddingTop: 14, fontSize: 12 }} formatter={legendFormatter} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="metric-list">
            <div><span>{rt('expenseRatio')}</span><strong>{fmtPct(current.expenseRatio)}</strong></div>
            <div><span>Largest cost lane</span><strong>{dominantExpense.name}</strong></div>
          </div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <div>
              <span className="report-section-kicker">{rt('smartInsights')}</span>
              <h3>{rt('smartInsights')}</h3>
            </div>
            <p>Short reads designed to help you scan what changed before you dive into the tables.</p>
          </div>

          <div className="insight-grid">
            {insights.map((insight, idx) => (
              <article key={insight} className="insight-card">
                <div className="insight-card-head">
                  <Lightbulb size={16} />
                  <span>Insight {idx + 1}</span>
                </div>
                <p>{insight}</p>
              </article>
            ))}
          </div>

          <div className="report-chart-shell report-chart-shell--compact">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={timelineData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--report-grid)" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="label" {...chartAxisProps} />
                <YAxis {...chartAxisProps} />
                <Tooltip formatter={(value) => fmtMoney(value)} {...chartTooltipProps} />
                <Line dataKey="expenses" name={rt('expenseTrend')} stroke="#ef4444" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="report-section report-export-section">
        <div className="report-section-head">
          <div>
            <span className="report-section-kicker">{rt('downloadAs')}</span>
            <h3>Export studio</h3>
          </div>
          <p>Package the same view for leadership, finance, or spreadsheet work without leaving this page.</p>
        </div>

        <div className="report-export-grid">
          {exportActions.map((action) => (
            <button key={action.label} type="button" className={`report-export-card ${action.variant}`} onClick={action.onClick}>
              <div className="report-export-icon"><Download size={16} /></div>
              <div className="report-export-copy">
                <strong>{action.label}</strong>
                <span>{action.meta}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
