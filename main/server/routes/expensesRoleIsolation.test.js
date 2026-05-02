import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('expenses route restricts manager category visibility and admin-only expense notifications', () => {
  const file = readFileSync(new URL('./expenses.js', import.meta.url), 'utf8');
  assert.match(file, /const visibilityFilter = req\.user\.role === 'manager' \? ' AND created_by = \$2' : ''/);
  assert.match(file, /authorizeRoles\('admin', 'manager'\)/);
  assert.match(file, /WHERE role = 'admin' AND is_active = true/);
  assert.match(file, /req\.user\.role === 'manager' \? 'AND created_by = \$3' : ''/);
});
