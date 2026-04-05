import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExpenseBreakdown, buildProductRows, buildSalesByHour, buildTimelineData, getPeakSalesHourLabel } from './reportAnalytics.js';

test('buildTimelineData uses real dated expenses, staff payments, waste, and batch costs', () => {
  const rows = buildTimelineData({
    sales_by_day: [
      { date: '2026-04-01', total_sales: '120' },
      { date: '2026-04-02', total_sales: '80' },
    ],
    details: {
      expenses: [{ expense_date: '2026-04-01', amount: '20' }],
      staff_payments: [{ payment_date: '2026-04-02', amount: '15' }],
      waste: [{ wasted_at: '2026-04-02T08:00:00.000Z', total_loss: '5' }],
      batches: {
        batch_list: [
          { created_at: '2026-04-01T06:00:00.000Z', line_cost: '30', status: 'sent' },
          { created_at: '2026-04-01T08:00:00.000Z', line_cost: '99', status: 'voided' },
        ],
      },
    },
  });

  assert.deepEqual(rows, [
    { label: '2026-04-01', revenue: 120, production_cost: 30, expenses: 20, net_profit: 70 },
    { label: '2026-04-02', revenue: 80, production_cost: 0, expenses: 20, net_profit: 60 },
  ]);
});

test('buildExpenseBreakdown aggregates real operating categories and finance buckets', () => {
  const rows = buildExpenseBreakdown({
    details: {
      expenses: [
        { category: 'Utilities', amount: '10' },
        { category: 'Utilities', amount: '15' },
        { category: 'Ingredients', amount: '40' },
      ],
      staff_payments: [{ amount: '25' }],
      waste: [{ total_loss: '7.5' }],
      batches: { batch_list: [{ line_cost: '30', status: 'sent' }, { line_cost: '80', status: 'voided' }] },
    },
  }, {
    staffPayroll: 'Staff Payroll',
    wasteLoss: 'Waste Loss',
    productionCost: 'Production Cost',
    other: 'Other',
  });

  assert.deepEqual(rows, [
    { name: 'Ingredients', value: 40 },
    { name: 'Production Cost', value: 30 },
    { name: 'Utilities', value: 25 },
    { name: 'Staff Payroll', value: 25 },
    { name: 'Waste Loss', value: 7.5 },
  ]);
});

test('buildProductRows prefers profitability endpoint data', () => {
  const rows = buildProductRows([
    {
      name: 'Roll',
      units_sold: '8',
      total_revenue: '80',
      total_cost: '32',
      gross_profit: '48',
      margin_percent: '60',
    },
  ], [
    { name: 'Ignored Fallback', revenue: '999' },
  ]);

  assert.deepEqual(rows, [
    {
      name: 'Roll',
      units: 8,
      revenue: 80,
      productionCost: 32,
      profit: 48,
      margin: 60,
      contribution: 100,
    },
  ]);
});

test('buildSalesByHour and getPeakSalesHourLabel normalize missing hours', () => {
  const report = {
    sales_by_hour: [
      { hour_of_day: '8', total_sales: '25' },
      { hour_of_day: '15', total_sales: '90' },
    ],
  };

  const rows = buildSalesByHour(report);
  assert.equal(rows.length, 24);
  assert.equal(rows[8].sales, 25);
  assert.equal(rows[15].sales, 90);
  assert.equal(getPeakSalesHourLabel(report, 'N/A'), '15:00');
  assert.equal(getPeakSalesHourLabel({}, 'N/A'), 'N/A');
});
