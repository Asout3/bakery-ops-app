import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('archive service archives all old pre-orders by pickup timestamp without status restriction', () => {
  const file = readFileSync(new URL('./archiveService.js', import.meta.url), 'utf8');
  assert.match(file, /sourceTable: 'customer_orders'/);
  assert.match(file, /whereClause: `location_id = \$1\s+AND COALESCE\(pickup_at, created_at\) < \$2`/);
  assert.doesNotMatch(file, /status IN \('picked_up', 'delivered', 'cancelled'\)/);
});
