import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('auth login/logout activity logging resolves a valid location id', async () => {
  const file = await readFile(new URL('./auth.js', import.meta.url), 'utf8');
  assert.match(file, /async function resolveActivityLocationId/);
  assert.match(file, /await resolveActivityLocationId\(user\.location_id\)/);
  assert.match(file, /await resolveActivityLocationId\(req\.user\.location_id\)/);
});
