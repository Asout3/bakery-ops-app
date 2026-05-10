import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manager batches show edited count and recomputed modal totals without total actions badge', () => {
  const file = readFileSync(new URL('./Batches.jsx', import.meta.url), 'utf8');
  assert.match(file, /Edited: \{stats\.edited\}/);
  assert.doesNotMatch(file, /Total Actions:/);
  assert.match(file, /editingItems\.reduce\(\(sum, item\) => sum \+ \(Number\(item\.unit_cost \|\| 0\) \* Number\(item\.quantity \|\| 0\)\), 0\)/);
});
