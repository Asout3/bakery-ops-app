import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('reports endpoints expose hourly sales breakdowns for report visualizations', () => {
  const file = fs.readFileSync(new URL('./reports.js', import.meta.url), 'utf8');
  assert.match(file, /sales_by_hour: salesByHourResult\.rows/);
  assert.match(file, /EXTRACT\(HOUR FROM s\.sale_date\)::int as hour_of_day/);
  assert.match(file, /GROUP BY EXTRACT\(HOUR FROM s\.sale_date\)/);
});
