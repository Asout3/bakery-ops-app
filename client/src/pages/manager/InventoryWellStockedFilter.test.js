import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manager inventory exposes a well-stocked filter and counts', () => {
  const file = readFileSync(new URL('./Inventory.jsx', import.meta.url), 'utf8');
  assert.match(file, /return 'well';/);
  assert.match(file, /Well Stocked \(\{stockCounts\.well\}\)/);
});
