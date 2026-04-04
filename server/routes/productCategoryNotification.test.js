import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('product category create route dispatches admin notifications', () => {
  const file = readFileSync(new URL('./products.js', import.meta.url), 'utf8');
  assert.match(file, /router\.post\('\/categories'/);
  assert.match(file, /title: 'New Product Category Added'/);
  assert.match(file, /notificationType: 'category_created'/);
  assert.match(file, /includeAdmins: true/);
});
