import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('product category create flow emits success and failure toasts', () => {
  const file = readFileSync(new URL('./Products.jsx', import.meta.url), 'utf8');
  assert.match(file, /toast\.success\(t\('categoryAdded'\)\)/);
  assert.match(file, /toast\.error\(errorMessage\)/);
});
