import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sales offline actor resolution accepts null-location cashier rows', async () => {
  const source = await readFile(new URL('./sales.js', import.meta.url), 'utf8');
  assert.match(source, /AND \(location_id = \$2 OR location_id IS NULL\)/);
});
