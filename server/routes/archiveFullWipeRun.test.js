import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('archive run route enables full_wipe by default for manual lifecycle runs', () => {
  const file = readFileSync(new URL('./archive.js', import.meta.url), 'utf8');
  assert.match(file, /const fullWipe = req\.body\?\.full_wipe !== false/);
  assert.match(file, /fullWipe,/);
});
