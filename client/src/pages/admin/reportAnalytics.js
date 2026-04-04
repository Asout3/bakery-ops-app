function normalizeDateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function addToDateBucket(map, value, amount) {
  const key = normalizeDateKey(value);
  if (!key) return;
  map.set(key, (map.get(key) || 0) + Number(amount || 0));
}

export function buildTimelineData(report) {
  const salesRows = Array.isArray(report?.sales_by_day) ? report.sales_by_day : [];
  const operatingCostByDate = new Map();
  const batchCostByDate = new Map();

  for (const expense of report?.details?.expenses || []) {
    addToDateBucket(operatingCostByDate, expense.expense_date, expense.amount);
  }
  for (const payment of report?.details?.staff_payments || []) {
    addToDateBucket(operatingCostByDate, payment.payment_date, payment.amount);
  }
  for (const waste of report?.details?.waste || []) {
    addToDateBucket(operatingCostByDate, waste.wasted_at, waste.total_loss);
  }
  for (const batchItem of report?.details?.batches?.batch_list || []) {
    addToDateBucket(batchCostByDate, batchItem.created_at, batchItem.line_cost);
  }

  return salesRows.map((row) => {
    const label = row.sale_date || row.date;
    const dateKey = normalizeDateKey(label);
    const revenue = Number(row.total_sales || 0);
    const productionCost = Number(batchCostByDate.get(dateKey) || 0);
    const expenses = Number(operatingCostByDate.get(dateKey) || 0);
    return {
      label,
      revenue,
      production_cost: productionCost,
      expenses,
      net_profit: revenue - productionCost - expenses,
    };
  });
}

export function buildExpenseBreakdown(report, labels = {}) {
  const entries = new Map();
  for (const expense of report?.details?.expenses || []) {
    const name = expense.category || labels.other || 'Other';
    entries.set(name, (entries.get(name) || 0) + Number(expense.amount || 0));
  }

  const staffTotal = (report?.details?.staff_payments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const wasteTotal = (report?.details?.waste || []).reduce((sum, row) => sum + Number(row.total_loss || 0), 0);
  const batchTotal = (report?.details?.batches?.batch_list || []).reduce((sum, row) => sum + Number(row.line_cost || 0), 0);

  if (staffTotal > 0) entries.set(labels.staffPayroll || 'Staff Payroll', staffTotal);
  if (wasteTotal > 0) entries.set(labels.wasteLoss || 'Waste Loss', wasteTotal);
  if (batchTotal > 0) entries.set(labels.productionCost || 'Production Cost', batchTotal);

  return Array.from(entries.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function buildProductRows(profitabilityRows = [], fallbackRows = []) {
  if (profitabilityRows.length) {
    const totalRevenue = profitabilityRows.reduce((sum, row) => sum + Number(row.total_revenue || 0), 0);
    return profitabilityRows.map((row) => {
      const revenue = Number(row.total_revenue || 0);
      const productionCost = Number(row.total_cost || 0);
      const profit = Number(row.gross_profit || 0);
      return {
        name: row.name || row.product_name || 'Unknown',
        units: Number(row.units_sold || row.total_sold || 0),
        revenue,
        productionCost,
        profit,
        margin: Number(row.margin_percent || 0),
        contribution: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      };
    });
  }

  const totalRevenue = fallbackRows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  return fallbackRows.map((row) => {
    const revenue = Number(row.revenue || 0);
    return {
      name: row.name || row.product_name || 'Unknown',
      units: Number(row.total_sold || row.quantity || row.units_sold || 0),
      revenue,
      productionCost: 0,
      profit: revenue,
      margin: revenue > 0 ? 100 : 0,
      contribution: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
    };
  });
}

export function buildSalesByHour(report) {
  const rows = Array.isArray(report?.sales_by_hour) ? report.sales_by_hour : [];
  const hourMap = new Map(rows.map((row) => [Number(row.hour_of_day), Number(row.total_sales || 0)]));
  return Array.from({ length: 24 }).map((_, hour) => ({
    hour,
    sales: Number(hourMap.get(hour) || 0),
  }));
}

export function getPeakSalesHourLabel(report, emptyLabel = 'N/A') {
  const rows = buildSalesByHour(report);
  const peak = rows.reduce((best, row) => (row.sales > best.sales ? row : best), { hour: null, sales: 0 });
  return peak.sales > 0 && peak.hour !== null ? `${String(peak.hour).padStart(2, '0')}:00` : emptyLabel;
}
