import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('salary due check covers three days ahead instead of two', () => {
  const file = readFileSync(new URL('./admin.js', import.meta.url), 'utf8');
  assert.match(file, /\[currentDay, currentDay \+ 3\]/);
  assert.match(file, /No salary payments due within 3 days/);
});
