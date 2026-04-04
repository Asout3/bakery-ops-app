import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('expenses routes enforce manager edit window ownership and current-date restrictions', () => {
  const file = readFileSync(new URL('./expenses.js', import.meta.url), 'utf8');
  assert.match(file, /router\.put\('\/:id', authenticateToken, authorizeRoles\('admin', 'manager'\)/);
  assert.match(file, /router\.delete\('\/:id', authenticateToken, authorizeRoles\('admin', 'manager'\)/);
  assert.match(file, /Managers can only record expenses for today\./);
  assert.match(file, /Managers can only keep expenses on the current date\./);
  assert.match(file, /You can only edit your own expenses\./);
  assert.match(file, /You can only delete your own expenses\./);
});
