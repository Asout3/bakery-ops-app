import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('staff payments UI uses selected-month filter, readable notes, and no payment date input', () => {
  const file = readFileSync(new URL('./StaffPayments.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(file, /FREQUENCY_OPTIONS/);
  assert.match(file, /type="month"/);
  assert.match(file, /Selected Month Paid/);
  assert.doesNotMatch(file, /Payment Date \*/);
  assert.match(file, /getReadableNote\(payment\.notes\)/);
});
