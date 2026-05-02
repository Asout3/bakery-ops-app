import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin staff routes expose profile update endpoint instead of returning Not Found', () => {
  const file = readFileSync(new URL('./admin.js', import.meta.url), 'utf8');
  assert.match(file, /router\.put\(\s*'\/staff\/:id'/);
  assert.match(file, /UPDATE staff_profiles/);
  assert.match(file, /UPDATE users/);
  assert.match(file, /'Staff Profile Updated'/);
});
