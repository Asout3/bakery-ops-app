import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Clock3,
  CreditCard,
  DollarSign,
  Package,
  Receipt,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { useLanguage } from '../../context/LanguageContext';
import SegmentedControl from '../../components/ui/SegmentedControl';
import './Dashboard.css';

const numberFormatter = new Intl.NumberFormat();

const formatMoney = (value) => `ETB ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatCompactMoney = (value) => {
  const amount = Number(value || 0);
  const absolute = Math.abs(amount);

  if (absolute >= 1000000) return `ETB ${(amount / 1000000).toFixed(1)}M`;
  if (absolute >= 1000) return `ETB ${(amount / 1000).toFixed(1)}K`;
  return formatMoney(amount);
};
const formatCompactNumber = (value) => numberFormatter.format(Number(value || 0));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalMonthInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseDateValue(value) {
  if (!value) return null;
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDisplayDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const date = parseDateValue(value);
  return date ? date.toLocaleDateString(undefined, options) : '-';
}

function formatMonthValue(value) {
  if (!value) return '-';
  const date = parseDateValue(`${value}-01`);
  return date ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '-';
}

function formatHourLabel(hour) {
  const safeHour = clamp(Number(hour || 0), 0, 23);
  const suffix = safeHour >= 12 ? 'PM' : 'AM';
  const normalizedHour = safeHour % 12 || 12;
  return `${normalizedHour}${suffix}`;
}

function formatMethodLabel(value) {
  return String(value || 'Unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildHourlyRhythm(rows = []) {
  const rowMap = new Map(
    rows.map((row) => [
      Number(row.hour_of_day || 0),
      {
        revenue: Number(row.total_sales || 0),
        transactions: Number(row.transactions || 0),
      },
    ]),
  );

  return Array.from({ length: 24 }, (_, hour) => {
    const current = rowMap.get(hour) || { revenue: 0, transactions: 0 };
    return {
      key: `hour-${hour}`,
      label: formatHourLabel(hour),
      tick: hour % 4 === 0 ? formatHourLabel(hour) : '',
      value: current.revenue,
      transactions: current.transactions,
      detail: `${formatCompactNumber(current.transactions)} txns`,
    };
  });
}

function buildDailyRhythm(rows = [], startDate, endDate) {
  if (!startDate || !endDate) return [];

  const rowMap = new Map(
    rows.map((row) => [
      String(row.date).slice(0, 10),
      {
        revenue: Number(row.total_sales || 0),
        transactions: Number(row.transactions || 0),
      },
    ]),
  );

  const series = [];
  const cursor = parseDateValue(startDate);
  const end = parseDateValue(endDate);
  if (!cursor || !end) return [];

  while (cursor <= end) {
    const key = getLocalDateInputValue(cursor);
    const current = rowMap.get(key) || { revenue: 0, transactions: 0 };
    series.push({
      key,
      label: cursor.toLocaleDateString(undefined, { weekday: 'short' }),
      tick: cursor.toLocaleDateString(undefined, { weekday: 'short' }),
      value: current.revenue,
      transactions: current.transactions,
      detail: formatDisplayDate(key, { month: 'short', day: 'numeric' }),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return series;
}

function getHealthState(score, netMargin, wasteRatio) {
  if (score >= 78) {
    return {
      label: 'Thriving',
      tone: 'success',
      note: `Margins are healthy and waste is staying at ${wasteRatio.toFixed(1)}% of revenue.`,
    };
  }

  if (score >= 58) {
    return {
      label: 'Steady',
      tone: 'warning',
      note: netMargin >= 0
        ? 'Profit is still positive, but there is room to tighten cost pressure.'
        : 'Sales are moving, but profit needs attention before it slips further.',
    };
  }

  return {
    label: 'Watch Closely',
    tone: 'danger',
    note: 'Cost drag is crowding the period. Focus on waste, staffing, and lower-margin activity.',
  };
}

export default function Dashboard() {
  const { selectedLocationId } = useBranch();
  const { t } = useLanguage();
  const MotionSection = motion.section;
  const MotionArticle = motion.article;

  const [period, setPeriod] = useState('daily');
  const [dailyDate, setDailyDate] = useState(getLocalDateInputValue());
  const [weekEndDate, setWeekEndDate] = useState(getLocalDateInputValue());
  const [monthValue, setMonthValue] = useState(getLocalMonthInputValue());

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadReport = async () => {
      setLoading(true);
      setError('');

      try {
        let response;
        if (period === 'daily') {
          response = await api.get(`/reports/daily?date=${dailyDate}`);
        } else if (period === 'weekly') {
          response = await api.get(`/reports/weekly?end_date=${weekEndDate}`);
        } else {
          const [year, month] = monthValue.split('-');
          response = await api.get(`/reports/monthly?year=${year}&month=${Number(month)}`);
        }

        setReport(response.data || null);
      } catch (err) {
        setError(err?.response?.data?.error || err?.message || 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [period, dailyDate, weekEndDate, monthValue, selectedLocationId]);

  const totals = useMemo(() => {
    if (!report) {
      return {
        revenue: 0,
        transactions: 0,
        expenses: 0,
        staffPayments: 0,
        batchCosts: 0,
        wasteLoss: 0,
        totalCosts: 0,
        grossProfit: 0,
        netProfit: 0,
      };
    }

    if (period === 'daily') {
      const revenue = Number(report.sales?.total_sales || 0);
      const transactions = Number(report.sales?.total_transactions || 0);
      const expenses = Number(report.expenses?.total_expenses || 0);
      const staffPayments = Number(report.staff_payments?.total_staff_payments || 0);
      const batchCosts = Number(report.profit?.batch_costs || report.details?.batches?.total_batch_cost || 0);
      const wasteLoss = Number(report.profit?.waste_loss || report.waste?.total_waste_loss || 0);
      const totalCosts = Number(report.profit?.total_costs || expenses + staffPayments + batchCosts + wasteLoss);
      const grossProfit = Number(report.profit?.gross_profit || (revenue - Number(report.profit?.sold_item_cost || 0)));
      const netProfit = Number(report.profit?.net_profit || revenue - totalCosts);
      return { revenue, transactions, expenses, staffPayments, batchCosts, wasteLoss, totalCosts, grossProfit, netProfit };
    }

    if (period === 'weekly') {
      const revenue = Number(report.summary?.total_sales || 0);
      const transactions = Number(report.summary?.total_transactions || 0);
      const expenses = Number(report.summary?.total_expenses || 0);
      const staffPayments = Number(report.summary?.total_staff_payments || 0);
      const batchCosts = Number(report.summary?.total_batch_costs || report.details?.batches?.total_batch_cost || 0);
      const wasteLoss = Number(report.summary?.total_waste_loss || report.waste?.total_waste_loss || 0);
      const totalCosts = Number(report.summary?.total_costs || expenses + staffPayments + batchCosts + wasteLoss);
      const grossProfit = Number(report.summary?.gross_profit || (revenue - Number(report.summary?.sold_item_cost || 0)));
      const netProfit = Number(report.summary?.net_profit || revenue - totalCosts);
      return { revenue, transactions, expenses, staffPayments, batchCosts, wasteLoss, totalCosts, grossProfit, netProfit };
    }

    const revenue = Number(report.sales?.total_sales || 0);
    const transactions = Number(report.sales?.total_transactions || 0);
    const expenses = Number(report.expenses?.total_expenses || 0);
    const staffPayments = Number(report.staff_payments?.total_staff_payments || 0);
    const batchCosts = Number(report.costs?.batch_costs || report.details?.batches?.total_batch_cost || 0);
    const wasteLoss = Number(report.costs?.waste_loss || report.waste?.total_waste_loss || 0);
    const totalCosts = Number(report.costs?.total_costs || expenses + staffPayments + batchCosts + wasteLoss);
    const grossProfit = Number(report.profit?.gross_profit || (revenue - Number(report.profit?.sold_item_cost || 0)));
    const netProfit = Number(report.profit?.net_profit || revenue - totalCosts);
    return { revenue, transactions, expenses, staffPayments, batchCosts, wasteLoss, totalCosts, grossProfit, netProfit };
  }, [report, period]);

  const topProducts = useMemo(() => report?.top_products || [], [report?.top_products]);
  const paymentMethods = useMemo(() => report?.payment_methods || [], [report?.payment_methods]);
  const expenseRows = useMemo(() => report?.details?.expenses || [], [report?.details?.expenses]);
  const staffPaymentRows = useMemo(() => report?.details?.staff_payments || [], [report?.details?.staff_payments]);
  const wasteRows = useMemo(() => report?.details?.waste || [], [report?.details?.waste]);
  const batchCount = useMemo(() => Number(report?.details?.batches?.batch_count || 0), [report?.details?.batches?.batch_count]);
  const cashierRows = useMemo(() => report?.details?.cashier_performance || [], [report?.details?.cashier_performance]);

  const periodLabel = period === 'daily'
    ? formatDisplayDate(dailyDate, { weekday: 'long', month: 'long', day: 'numeric' })
    : period === 'weekly'
      ? `${formatDisplayDate(report?.period?.start_date || weekEndDate, { month: 'short', day: 'numeric' })} - ${formatDisplayDate(report?.period?.end_date || weekEndDate, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : formatMonthValue(monthValue);

  const periodOptions = useMemo(
    () => [
      { value: 'daily', label: t('daily') },
      { value: 'weekly', label: t('weekly') },
      { value: 'monthly', label: t('monthly') },
    ],
    [t],
  );

  const averageTicket = useMemo(() => {
    if (period === 'weekly') return Number(report?.summary?.avg_transaction || 0);
    return Number(report?.sales?.avg_transaction || 0);
  }, [period, report]);

  const totalExpenseCount = useMemo(() => {
    if (period === 'weekly') return Number(report?.summary?.expense_count || expenseRows.length || 0);
    return Number(report?.expenses?.expense_count || expenseRows.length || 0);
  }, [period, report, expenseRows.length]);

  const totalStaffPaymentCount = useMemo(() => {
    if (period === 'weekly') return Number(report?.summary?.staff_payment_count || staffPaymentRows.length || 0);
    return Number(report?.staff_payments?.payment_count || staffPaymentRows.length || 0);
  }, [period, report, staffPaymentRows.length]);

  const totalWasteCount = Number(report?.waste?.waste_count || report?.summary?.waste_count || 0);
  const netMargin = totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0;
  const grossMargin = totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : 0;
  const costRatio = totals.revenue > 0 ? (totals.totalCosts / totals.revenue) * 100 : 0;
  const wasteRatio = totals.revenue > 0 ? (totals.wasteLoss / totals.revenue) * 100 : 0;
  const digitalSales = cashierRows.reduce((sum, row) => sum + Number(row.mobile_sales || 0) + Number(row.telebirr_sales || 0), 0);
  const digitalMix = totals.revenue > 0 ? (digitalSales / totals.revenue) * 100 : 0;
  const offlineSyncedSales = cashierRows.reduce((sum, row) => sum + Number(row.offline_synced_transactions || 0), 0);

  const healthScore = useMemo(() => {
    const marginScore = clamp((netMargin + 20) * 2.1, 0, 100);
    const wasteScore = clamp(100 - (wasteRatio * 7), 0, 100);
    const costScore = clamp(100 - Math.max(costRatio - 65, 0) * 2.2, 0, 100);
    const transactionScore = clamp(Math.min(totals.transactions, 80) * 1.2, 0, 100);
    return Math.round((marginScore * 0.42) + (wasteScore * 0.18) + (costScore * 0.25) + (transactionScore * 0.15));
  }, [costRatio, netMargin, totals.transactions, wasteRatio]);

  const healthState = useMemo(
    () => getHealthState(healthScore, netMargin, wasteRatio),
    [healthScore, netMargin, wasteRatio],
  );

  const healthTooltip = `Business health score ${healthScore}/100. It blends margin, waste, cost ratio, and transaction volume. ${healthState.note}`;

  const topProductRows = useMemo(
    () => topProducts.slice(0, 5).map((product, index) => {
      const revenue = Number(product.revenue || 0);
      const share = totals.revenue > 0 ? (revenue / totals.revenue) * 100 : 0;
      return {
        rank: index + 1,
        name: product.name,
        units: Number(product.total_sold || 0),
        revenue,
        share,
        tooltip: `${product.name} contributes ${share.toFixed(1)}% of revenue in this period.`,
      };
    }),
    [topProducts, totals.revenue],
  );

  const paymentMix = useMemo(
    () => paymentMethods.map((method) => {
      const total = Number(method.total || 0);
      const count = Number(method.count || 0);
      const share = totals.revenue > 0 ? (total / totals.revenue) * 100 : 0;
      return {
        label: formatMethodLabel(method.payment_method),
        total,
        count,
        share,
        tooltip: `${formatMethodLabel(method.payment_method)} covers ${share.toFixed(1)}% of sales in this period.`,
      };
    }),
    [paymentMethods, totals.revenue],
  );

  const costBreakdown = useMemo(() => {
    const rows = [
      { label: 'Production batches', value: totals.batchCosts, tone: 'primary' },
      { label: 'Manual expenses', value: totals.expenses, tone: 'warning' },
      { label: 'Staff payments', value: totals.staffPayments, tone: 'info' },
      { label: 'Waste loss', value: totals.wasteLoss, tone: 'danger' },
    ];

    return rows.map((row) => {
      const share = totals.totalCosts > 0 ? (row.value / totals.totalCosts) * 100 : 0;

      return {
        ...row,
        share,
        tooltip: `${row.label} makes up ${share.toFixed(1)}% of total cost in this period.`,
      };
    });
  }, [totals.batchCosts, totals.expenses, totals.staffPayments, totals.totalCosts, totals.wasteLoss]);

  const primaryCostDriver = useMemo(
    () => [...costBreakdown].sort((left, right) => right.value - left.value)[0] || null,
    [costBreakdown],
  );

  const expenseCategoryRows = useMemo(() => {
    if (Array.isArray(report?.expenses?.by_category) && report.expenses.by_category.length) {
      return report.expenses.by_category
        .map((row) => {
          const total = Number(row.total || 0);
          const share = totals.expenses > 0 ? (total / totals.expenses) * 100 : 0;

          return {
            label: row.category || 'Uncategorized',
            total,
            share,
            tooltip: `${row.category || 'Uncategorized'} makes up ${share.toFixed(1)}% of manual expenses.`,
          };
        })
        .sort((left, right) => right.total - left.total)
        .slice(0, 4);
    }

    const totalsByCategory = expenseRows.reduce((accumulator, row) => {
      const key = row.category || 'Uncategorized';
      accumulator.set(key, (accumulator.get(key) || 0) + Number(row.amount || 0));
      return accumulator;
    }, new Map());

    return Array.from(totalsByCategory.entries())
      .map(([label, total]) => {
        const share = totals.expenses > 0 ? (total / totals.expenses) * 100 : 0;

        return {
          label,
          total,
          share,
          tooltip: `${label} makes up ${share.toFixed(1)}% of manual expenses.`,
        };
      })
      .sort((left, right) => right.total - left.total)
      .slice(0, 4);
  }, [report?.expenses?.by_category, expenseRows]);

  const rhythmData = useMemo(() => {
    if (!report) return [];

    if (period === 'weekly') {
      return buildDailyRhythm(
        report.sales_by_day || [],
        report?.period?.start_date || weekEndDate,
        report?.period?.end_date || weekEndDate,
      );
    }

    return buildHourlyRhythm(report.sales_by_hour || []);
  }, [period, report, weekEndDate]);

  const peakRhythmPoint = useMemo(
    () => rhythmData.reduce((best, point) => (point.value > best.value ? point : best), { value: 0, label: '-', detail: '-' }),
    [rhythmData],
  );

  const topCashier = useMemo(
    () => [...cashierRows]
      .map((row) => ({
        ...row,
        total_sales: Number(row.total_sales || 0),
        transactions: Number(row.transactions || 0),
        items_sold: Number(row.items_sold || 0),
        cash_sales: Number(row.cash_sales || 0),
        mobile_sales: Number(row.mobile_sales || 0),
        telebirr_sales: Number(row.telebirr_sales || 0),
        offline_synced_transactions: Number(row.offline_synced_transactions || 0),
      }))
      .sort((left, right) => right.total_sales - left.total_sales)[0] || null,
    [cashierRows],
  );

  const heroMetrics = useMemo(
    () => [
      {
        icon: <DollarSign size={18} />,
        label: `${periodOptions.find((option) => option.value === period)?.label || period} Revenue`,
        value: formatMoney(totals.revenue),
        note: `Gross margin ${grossMargin.toFixed(1)}%`,
        tooltip: `Total sales for the selected ${period} period. Compare it with net profit to see how much remains after costs.`,
        tone: 'primary',
      },
      {
        icon: totals.grossProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />,
        label: 'Gross Profit',
        value: formatMoney(totals.grossProfit),
        note: 'Unit price - cost only',
        tooltip: 'Revenue minus sold item cost only. This compares sale price against product cost and ignores payroll, waste, and other overhead.',
        tone: totals.grossProfit >= 0 ? 'success' : 'danger',
      },
      {
        icon: totals.netProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />,
        label: 'Net Profit',
        value: formatMoney(totals.netProfit),
        note: `Margin ${netMargin.toFixed(1)}%`,
        tooltip: 'Revenue after all tracked costs. Compare it with total sales to see the margin left over.',
        tone: totals.netProfit >= 0 ? 'success' : 'danger',
      },
      {
        icon: <Wallet size={18} />,
        label: 'Average Sale',
        value: formatMoney(averageTicket),
        note: `${formatCompactNumber(totals.transactions)} transactions`,
        tooltip: 'Average ticket value across all transactions. Compare it with transaction count to see whether growth came from more orders or larger baskets.',
        tone: 'info',
      },
      {
        icon: <Receipt size={18} />,
        label: 'Total Costs',
        value: formatMoney(totals.totalCosts),
        note: `Waste drag ${wasteRatio.toFixed(1)}%`,
        tooltip: 'Combined expenses, staff pay, batch costs, and waste loss. Compare it with revenue to judge the cost load.',
        tone: 'warning',
      },
    ],
    [averageTicket, grossMargin, netMargin, period, periodOptions, totals.grossProfit, totals.netProfit, totals.revenue, totals.totalCosts, totals.transactions, wasteRatio],
  );

  const quickInsights = useMemo(() => {
    const leadPayment = paymentMix[0];
    const leadProduct = topProductRows[0];

    return [
      {
        icon: <Package size={16} />,
        label: 'Best seller',
        value: leadProduct?.name || 'No sales yet',
        caption: leadProduct ? `${leadProduct.share.toFixed(1)}% of revenue` : 'Waiting for product movement',
        tooltip: leadProduct
          ? `Top product by revenue share. ${leadProduct.name} accounts for ${leadProduct.share.toFixed(1)}% of revenue in this period.`
          : 'No sales recorded in this period yet.',
        tone: 'primary',
      },
      {
        icon: <CreditCard size={16} />,
        label: 'Preferred payment',
        value: leadPayment?.label || 'No payment mix yet',
        caption: leadPayment ? `${leadPayment.share.toFixed(1)}% of sales` : 'No completed transactions',
        tooltip: leadPayment
          ? `Payment method with the largest share of sales. ${leadPayment.label} covers ${leadPayment.share.toFixed(1)}% of sales.`
          : 'No completed transactions in this period yet.',
        tone: 'info',
      },
      {
        icon: <Clock3 size={16} />,
        label: period === 'weekly' ? 'Strongest day' : 'Peak hour',
        value: peakRhythmPoint?.label || '-',
        caption: peakRhythmPoint?.value ? formatMoney(peakRhythmPoint.value) : 'No sales pattern yet',
        tooltip: peakRhythmPoint?.value
          ? `Busiest point in the selected period. ${peakRhythmPoint.label} captured ${formatMoney(peakRhythmPoint.value)}.`
          : 'No sales activity recorded in this period yet.',
        tone: 'success',
      },
      {
        icon: primaryCostDriver?.tone === 'danger' ? <AlertTriangle size={16} /> : <Activity size={16} />,
        label: 'Cost pressure',
        value: primaryCostDriver?.label || 'No costs recorded',
        caption: primaryCostDriver ? `${primaryCostDriver.share.toFixed(1)}% of total cost` : 'Nothing recorded in this period',
        tooltip: primaryCostDriver
          ? `${primaryCostDriver.label} is the largest cost driver, at ${primaryCostDriver.share.toFixed(1)}% of total cost.`
          : 'No costs recorded in this period yet.',
        tone: primaryCostDriver?.tone || 'warning',
      },
    ];
  }, [paymentMix, peakRhythmPoint, period, primaryCostDriver, topProductRows]);

  const activityFeed = useMemo(() => {
    const expenseItems = expenseRows.map((row) => ({
      type: 'Expense',
      title: row.category || 'Expense',
      meta: row.created_by_name ? `Recorded by ${row.created_by_name}` : 'Recorded manually',
      amount: Number(row.amount || 0),
      date: row.expense_date,
      tooltip: `${row.category || 'Expense'} recorded in the selected period. Compare it with other recent cost-side entries.`,
      tone: 'warning',
    }));

    const staffItems = staffPaymentRows.map((row) => ({
      type: 'Staff',
      title: row.staff_name || 'Staff payment',
      meta: row.payment_type ? formatMethodLabel(row.payment_type) : 'Salary payment',
      amount: Number(row.amount || 0),
      date: row.payment_date,
      tooltip: 'Staff payment recorded in the selected period. Compare it with other payouts to see payroll pressure.',
      tone: 'info',
    }));

    const wasteItems = wasteRows.map((row) => ({
      type: 'Waste',
      title: row.product_name || 'Waste record',
      meta: `${Number(row.quantity_wasted || 0)} ${row.unit || 'units'}${row.reason ? ` - ${row.reason}` : ''}`,
      amount: Number(row.total_loss || 0),
      date: row.wasted_at,
      tooltip: 'Waste recorded in the selected period. Compare it with other losses to see what was written off.',
      tone: 'danger',
    }));

    return [...expenseItems, ...staffItems, ...wasteItems]
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 6);
  }, [expenseRows, staffPaymentRows, wasteRows]);

  const operationsCards = useMemo(
    () => [
      {
        label: 'Expense records',
        value: formatCompactNumber(totalExpenseCount),
        note: formatMoney(totals.expenses),
        tooltip: 'Count of manual expense entries in the selected period. Compare the total with revenue to judge spend pressure.',
      },
      {
        label: 'Staff payouts',
        value: formatCompactNumber(totalStaffPaymentCount),
        note: formatMoney(totals.staffPayments),
        tooltip: 'Count of staff payment entries in the selected period. Compare the total with sales to judge payroll pressure.',
      },
      {
        label: 'Waste records',
        value: formatCompactNumber(totalWasteCount),
        note: formatMoney(totals.wasteLoss),
        tooltip: 'Count of waste entries in the selected period. Compare the total with revenue to see how much value was lost.',
      },
      {
        label: 'Batches closed',
        value: formatCompactNumber(batchCount),
        note: formatMoney(totals.batchCosts),
        tooltip: 'Count of closed batches in the selected period. Compare the total with revenue to see batch cost pressure.',
      },
    ],
    [batchCount, totalExpenseCount, totalStaffPaymentCount, totalWasteCount, totals.batchCosts, totals.expenses, totals.staffPayments, totals.wasteLoss],
  );

  const healthRingStyle = useMemo(
    () => ({
      background: `conic-gradient(var(--btn-mid) ${healthScore * 3.6}deg, color-mix(in srgb, var(--accent-border) 78%, transparent) 0deg)`,
    }),
    [healthScore],
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading dashboard insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page dashboard-v2">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  return (
    <div className="dashboard-page dashboard-v2">
      <MotionSection
        className="dashboard-hero"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="dashboard-hero-main">
          <div className="dashboard-hero-copy">
            <div className="dashboard-kicker">
              <Sparkles size={14} />
              <span>Admin command center</span>
            </div>
            <h2 className="dashboard-hero-title">{t('dashboard')}</h2>
            <p className="dashboard-hero-subtitle">
              Revenue, margin, product momentum, and operating drag in one cleaner read.
            </p>
            <div className="dashboard-hero-badges">
              <span className="dashboard-badge">
                <Calendar size={14} />
                {periodLabel}
              </span>
              <span className="dashboard-badge dashboard-badge-muted">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
          </div>

          <div className="dashboard-health-panel" title={healthTooltip}>
            <div className="dashboard-health-ring" style={healthRingStyle}>
              <div className="dashboard-health-core">
                <strong>{healthScore}</strong>
                <span>/100</span>
              </div>
            </div>
            <div className="dashboard-health-copy">
              <p className="dashboard-health-label">Business health</p>
              <h3 className={clsx('dashboard-health-title', `tone-text-${healthState.tone}`)}>{healthState.label}</h3>
              <p className="dashboard-health-note">{healthState.note}</p>
            </div>
          </div>
        </div>

        <div className="dashboard-toolbar">
          <div className="dashboard-toolbar-group dashboard-toolbar-period">
            <div className="dashboard-control-label">
              <Calendar size={16} />
              <strong>{t('periodLabel')}:</strong>
            </div>
            <SegmentedControl
              value={period}
              onChange={setPeriod}
              options={periodOptions}
              ariaLabel={t('periodLabel')}
            />
          </div>

          <div className="dashboard-toolbar-group dashboard-toolbar-date">
            {period === 'daily' && (
              <input
                type="date"
                className="form-control date-input"
                value={dailyDate}
                onChange={(event) => setDailyDate(event.target.value)}
              />
            )}
            {period === 'weekly' && (
              <input
                type="date"
                className="form-control date-input"
                value={weekEndDate}
                onChange={(event) => setWeekEndDate(event.target.value)}
              />
            )}
            {period === 'monthly' && (
              <input
                type="month"
                className="form-control date-input"
                value={monthValue}
                onChange={(event) => setMonthValue(event.target.value)}
              />
            )}
          </div>
        </div>

        <div className="dashboard-hero-grid">
          {heroMetrics.map((item, index) => (
            <MetricTile key={item.label} {...item} index={index} />
          ))}
        </div>
      </MotionSection>

      <div className="dashboard-glance-grid">
        {quickInsights.map((item, index) => (
          <MotionArticle
            key={item.label}
            className={clsx('dashboard-glance-card', `tone-surface-${item.tone}`)}
            title={item.tooltip}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.06 + index * 0.04 }}
          >
            <div className={clsx('dashboard-glance-icon', `tone-chip-${item.tone}`)}>{item.icon}</div>
            <div className="dashboard-glance-copy">
              <span className="dashboard-glance-label">{item.label}</span>
              <strong className="dashboard-glance-value">{item.value}</strong>
              <span className="dashboard-glance-caption">{item.caption}</span>
            </div>
          </MotionArticle>
        ))}
      </div>

      <div className="dashboard-pulse-grid">
        <MotionSection
          className="dashboard-panel dashboard-panel-rhythm"
          title={period === 'weekly'
            ? 'Shows daily sales flow across the selected week so you can compare busy days with quieter ones.'
            : 'Shows hourly sales flow for the selected period so you can compare peak slots with slower ones.'}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.14 }}
        >
          <div className="dashboard-panel-header">
            <div>
              <h3>Sales rhythm</h3>
              <p>{period === 'weekly' ? 'Daily flow across the selected week.' : 'Hourly sales shape for the selected period.'}</p>
            </div>
            <div className="dashboard-panel-aside">
              <span className="dashboard-inline-note">
                <Clock3 size={13} />
                Peak {peakRhythmPoint?.label || '-'}
              </span>
              <strong>{peakRhythmPoint?.value ? formatMoney(peakRhythmPoint.value) : 'No sales yet'}</strong>
            </div>
          </div>
          <SignalBars data={rhythmData} />
        </MotionSection>

        <MotionSection
          className="dashboard-panel dashboard-panel-products"
          title="Ranks products by revenue share so you can compare the leading items against the full sales mix."
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.18 }}
        >
          <div className="dashboard-panel-header">
            <div>
              <h3>Top products</h3>
              <p>See which products are carrying the period.</p>
            </div>
          </div>
          <ProgressList
            items={topProductRows.map((row) => ({
              label: row.name,
              value: row.share,
              amount: formatMoney(row.revenue),
              detail: `${formatCompactNumber(row.units)} units sold`,
              tooltip: row.tooltip,
            }))}
            empty="No products sold in this period."
          />
        </MotionSection>

        <MotionSection
          className="dashboard-panel dashboard-panel-payments"
          title="Breaks sales down by payment method so you can compare cash, mobile, and Telebirr share."
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.22 }}
        >
          <div className="dashboard-panel-header">
            <div>
              <h3>Payment mix</h3>
              <p>How customers chose to pay.</p>
            </div>
            <strong>{digitalMix.toFixed(1)}% digital</strong>
          </div>
          <ProgressList
            items={paymentMix.map((row) => ({
              label: row.label,
              value: row.share,
              amount: formatMoney(row.total),
              detail: `${formatCompactNumber(row.count)} sales`,
              tooltip: row.tooltip,
            }))}
            empty="No payment records in this period."
          />
        </MotionSection>

        <MotionSection
          className="dashboard-panel dashboard-panel-costs"
          title="Breaks total cost into drivers so you can compare each cost bucket against the overall cost load."
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.26 }}
        >
          <div className="dashboard-panel-header">
            <div>
              <h3>Cost pressure</h3>
              <p>Where the current drag is coming from.</p>
            </div>
            <strong>{costRatio.toFixed(1)}% of revenue</strong>
          </div>

          <div className="dashboard-cost-list">
            {costBreakdown.map((row) => (
              <article key={row.label} className="dashboard-cost-item" title={row.tooltip}>
                <div className="dashboard-cost-head">
                  <div>
                    <strong>{row.label}</strong>
                    <span>{row.share.toFixed(1)}% of total cost</span>
                  </div>
                  <strong>{formatMoney(row.value)}</strong>
                </div>
                <div className="dashboard-progress-track">
                  <div
                    className={clsx('dashboard-progress-fill', `tone-fill-${row.tone}`)}
                    style={{ width: `${Math.max(row.share, row.value > 0 ? 8 : 0)}%` }}
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="dashboard-cost-footer">
            <div className="dashboard-focus-note">
              <span className="dashboard-focus-label">Main cost driver</span>
              <strong>{primaryCostDriver?.label || 'No costs recorded'}</strong>
            </div>
            <div className="dashboard-focus-note">
              <span className="dashboard-focus-label">Gross margin</span>
              <strong>{grossMargin.toFixed(1)}%</strong>
            </div>
            <div className="dashboard-focus-note">
              <span className="dashboard-focus-label">Offline sync sales</span>
              <strong>{formatCompactNumber(offlineSyncedSales)}</strong>
            </div>
          </div>
        </MotionSection>
      </div>

      <div className="dashboard-bottom-grid">
        <MotionSection
          className="dashboard-panel dashboard-panel-team"
          title="Compares cashier performance by sales, transactions, average ticket, digital mix, and offline sync volume."
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.3 }}
        >
          <div className="dashboard-panel-header">
            <div>
              <h3>Team board</h3>
              <p>Clean leaderboard for the front-of-house team.</p>
            </div>
            {topCashier ? (
              <div className="dashboard-panel-aside">
                <span className="dashboard-inline-note">
                  <Users size={13} />
                  Top performer
                </span>
                <strong>{topCashier.cashier_name}</strong>
              </div>
            ) : null}
          </div>

          <div className="table-responsive dashboard-team-table-wrap">
            <table className="table dashboard-team-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Sales</th>
                  <th>Txns</th>
                  <th>Avg Ticket</th>
                  <th>Items</th>
                  <th>Digital Mix</th>
                  <th>Sync</th>
                </tr>
              </thead>
              <tbody>
                {cashierRows.length ? cashierRows.map((row, index) => {
                  const totalSales = Number(row.total_sales || 0);
                  const transactions = Number(row.transactions || 0);
                  const itemsSold = Number(row.items_sold || 0);
                  const digitalShare = totalSales > 0
                    ? ((Number(row.mobile_sales || 0) + Number(row.telebirr_sales || 0)) / totalSales) * 100
                    : 0;

                  return (
                    <tr key={`${row.cashier_name}-${index}`}>
                      <td>
                        <div className="dashboard-member-cell">
                          <strong>{row.cashier_name}</strong>
                          <span>{formatMethodLabel(row.cashier_role)}</span>
                        </div>
                      </td>
                      <td>{formatMoney(totalSales)}</td>
                      <td>{formatCompactNumber(transactions)}</td>
                      <td>{formatMoney(transactions > 0 ? totalSales / transactions : 0)}</td>
                      <td>{formatCompactNumber(itemsSold)}</td>
                      <td>{digitalShare.toFixed(1)}%</td>
                      <td>{formatCompactNumber(row.offline_synced_transactions || 0)}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={7} className="text-center text-muted">
                      No cashier performance data in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </MotionSection>

        <MotionSection
          className="dashboard-panel dashboard-panel-operations"
          title="Summarizes counts and recent cost-side activity so you can compare volume and pressure points at a glance."
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.34 }}
        >
          <div className="dashboard-panel-header">
            <div>
              <h3>Operations digest</h3>
              <p>Counts, pressure points, and the latest cost-side activity.</p>
            </div>
          </div>

          <div className="dashboard-operations-grid">
            {operationsCards.map((item) => (
              <article key={item.label} className="dashboard-operation-card" title={item.tooltip}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.note}</small>
              </article>
            ))}
          </div>

          {expenseCategoryRows.length ? (
            <div className="dashboard-mini-section">
              <div className="dashboard-mini-header">
                <h4>Expense focus</h4>
                <span>{expenseCategoryRows[0]?.label || 'Uncategorized'} leads</span>
              </div>
              <ProgressList
                compact
                items={expenseCategoryRows.map((row) => ({
                  label: row.label,
                  value: totals.expenses > 0 ? (row.total / totals.expenses) * 100 : 0,
                  amount: formatMoney(row.total),
                  detail: 'Manual expense share',
                  tooltip: row.tooltip,
                }))}
                empty="No expense categories recorded."
              />
            </div>
          ) : null}

          <div className="dashboard-mini-section">
            <div className="dashboard-mini-header">
              <h4>Recent cost-side activity</h4>
              <span>{activityFeed.length ? `${activityFeed.length} latest entries` : 'No activity yet'}</span>
            </div>

            <div className="dashboard-activity-feed">
              {activityFeed.length ? activityFeed.map((item, index) => (
                <article key={`${item.type}-${item.title}-${index}`} className="dashboard-activity-item" title={item.tooltip}>
                  <div className={clsx('dashboard-activity-icon', `tone-chip-${item.tone}`)}>
                    {item.type === 'Waste' ? <AlertTriangle size={14} /> : item.type === 'Staff' ? <Users size={14} /> : <Receipt size={14} />}
                  </div>
                  <div className="dashboard-activity-copy">
                    <div className="dashboard-activity-heading">
                      <strong>{item.title}</strong>
                      <span>{formatDisplayDate(item.date, { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <p>{item.type}</p>
                    <small>{item.meta}</small>
                  </div>
                  <strong className="dashboard-activity-amount">{formatMoney(item.amount)}</strong>
                </article>
              )) : (
                <div className="dashboard-inline-empty">Nothing recorded in this period yet.</div>
              )}
            </div>
          </div>
        </MotionSection>
      </div>
    </div>
  );
}

function MetricTile({ icon, label, value, note, tooltip, tone = 'primary', index = 0 }) {
  return (
    <motion.article
      className={clsx('dashboard-metric-tile', `tone-surface-${tone}`)}
      title={tooltip}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: 0.08 + index * 0.04 }}
    >
      <div className={clsx('dashboard-metric-icon', `tone-chip-${tone}`)}>{icon}</div>
      <div className="dashboard-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </motion.article>
  );
}

function SignalBars({ data }) {
  const maxValue = Math.max(...data.map((item) => item.value), 0);
  const dense = data.length > 12;

  return (
    <div className="dashboard-bars-scroll">
      <div
        className={clsx('dashboard-bars', { 'dashboard-bars-dense': dense })}
        style={{
          gridTemplateColumns: `repeat(${Math.max(data.length, 1)}, minmax(${dense ? 22 : 44}px, 1fr))`,
          minWidth: dense ? `${data.length * 34}px` : undefined,
        }}
      >
        {data.length ? data.map((item) => {
          const height = maxValue > 0 ? Math.max((item.value / maxValue) * 100, item.value > 0 ? 10 : 0) : 0;

          return (
            <div
              key={item.key}
              className="dashboard-bar-item"
              title={`${item.label}: ${formatMoney(item.value)} (${formatCompactNumber(item.transactions)} transactions)`}
            >
              <span className="dashboard-bar-value">{item.value > 0 ? formatCompactMoney(item.value) : ''}</span>
              <div className="dashboard-bar-track">
                <div className="dashboard-bar-fill" style={{ height: `${height}%` }} />
              </div>
              <span className="dashboard-bar-label">{item.tick || item.label}</span>
              <small className="dashboard-bar-detail">{item.detail}</small>
            </div>
          );
        }) : (
          <div className="dashboard-inline-empty">No sales activity in this period.</div>
        )}
      </div>
    </div>
  );
}

function ProgressList({ items, empty, compact = false }) {
  return (
    <div className={clsx('dashboard-progress-list', { compact })}>
      {items.length ? items.map((item, index) => (
        <article key={`${item.label}-${index}`} className="dashboard-progress-item" title={item.tooltip}>
          <div className="dashboard-progress-head">
            <div>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
            <strong>{item.amount}</strong>
          </div>
          <div className="dashboard-progress-track">
            <div
              className="dashboard-progress-fill"
              style={{
                width: `${Math.max(item.value, item.amount && item.value > 0 ? 8 : 0)}%`,
              }}
            />
          </div>
        </article>
      )) : (
        <div className="dashboard-inline-empty">{empty}</div>
      )}
    </div>
  );
}
