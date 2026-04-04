import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manager expense modal hides date picker and forces today in submit payload', () => {
  const file = readFileSync(new URL('./Expenses.jsx', import.meta.url), 'utf8');
  assert.match(file, /const payload = isAdmin \? formData : \{ \.\.\.formData, expense_date: today \};/);
  assert.match(file, /\{isAdmin \? <div className="mb-3"><label className="form-label">Date \*<\/label><input type="date"/);
});
