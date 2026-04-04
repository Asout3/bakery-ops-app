import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('reports compute gross profit using sold item cost and not operating expenses', () => {
  const file = readFileSync(new URL('./reports.js', import.meta.url), 'utf8');
  assert.match(file, /sold_item_cost/);
  assert.match(file, /COALESCE\(SUM\(si\.quantity \* COALESCE\(p\.cost, 0\)\), 0\) as sold_item_cost/);
  assert.match(file, /const grossProfit = totalRevenue - soldItemCost/);
});
