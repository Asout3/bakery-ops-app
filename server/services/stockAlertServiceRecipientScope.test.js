import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('stock alert notifications include global admins and local managers', () => {
  const file = readFileSync(new URL('./stockAlertService.js', import.meta.url), 'utf8');
  assert.match(file, /\(role = 'admin' AND \(location_id = \$1 OR location_id IS NULL\)\)/);
  assert.match(file, /\(role = 'manager' AND location_id = \$1\)/);
});
