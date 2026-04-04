import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin inventory exposes a well-stocked filter distinct from low/out stock', () => {
  const file = readFileSync(new URL('./Inventory.jsx', import.meta.url), 'utf8');
  assert.match(file, /if \(stockFilter === 'well'\) return qty > threshold;/);
  assert.match(file, />Well Stocked</);
});
