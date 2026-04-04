import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin sales batch view exposes summary cards for batch performance', () => {
  const file = readFileSync(new URL('./Sales.jsx', import.meta.url), 'utf8');
  assert.match(file, /Total Batch Cost/);
  assert.match(file, /Total Actions/);
  assert.match(file, /Total Batches Sent/);
  assert.match(file, /Total Batches Edited/);
});
