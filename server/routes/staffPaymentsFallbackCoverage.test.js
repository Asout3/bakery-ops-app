import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('staff-for-payments includes active users not linked to staff profiles', () => {
  const file = readFileSync(new URL('./admin.js', import.meta.url), 'utf8');
  assert.match(file, /UNION ALL/);
  assert.match(file, /NOT EXISTS \(\s*SELECT 1\s*FROM staff_profiles sp\s*WHERE sp\.linked_user_id = u\.id/s);
  assert.match(file, /AND u\.role IN \('manager', 'cashier'\)/);
});
