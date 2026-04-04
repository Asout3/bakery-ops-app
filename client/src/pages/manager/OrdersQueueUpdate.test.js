import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manager orders updates queue rows locally instead of forcing a full reload', () => {
  const file = readFileSync(new URL('./Orders.jsx', import.meta.url), 'utf8');
  assert.match(file, /const response = await api\.patch\(/);
  assert.match(file, /setOrders\(\(current\) => current\.map/);
  assert.doesNotMatch(file, /await api\.patch\(`\/orders\/\$\{order\.id\}`,\s*patch\);\s*setMessage[\s\S]*load\(\);/);
});
