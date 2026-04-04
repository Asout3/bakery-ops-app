import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manager batches show edited count, total actions, and recomputed modal totals', () => {
  const file = readFileSync(new URL('./Batches.jsx', import.meta.url), 'utf8');
  assert.match(file, /Edited: \{stats\.edited\}/);
  assert.match(file, /Total Actions: \{stats\.totalActions\}/);
  assert.match(file, /editingItems\.reduce\(\(sum, item\) => sum \+ \(Number\(item\.unit_cost \|\| 0\) \* Number\(item\.quantity \|\| 0\)\), 0\)/);
});
