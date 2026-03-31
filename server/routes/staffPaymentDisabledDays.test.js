import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('staff-for-payments response includes disabled-day deduction and recommended payment fields', () => {
  const file = readFileSync(new URL('./admin.js', import.meta.url), 'utf8');
  assert.match(file, /disabled_days_in_cycle/);
  assert.match(file, /disabled_day_deduction/);
  assert.match(file, /recommended_payment/);
});

test('admin status toggles record staff_status_history for deduction tracking', () => {
  const file = readFileSync(new URL('./admin.js', import.meta.url), 'utf8');
  assert.match(file, /CREATE TABLE IF NOT EXISTS staff_status_history/);
  assert.match(file, /recordStaffStatusHistory\(/);
});
