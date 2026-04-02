import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('CORS allowlists include Cache-Control for compatibility with legacy clients', async () => {
  const file = await readFile(new URL('./security.js', import.meta.url), 'utf8');
  assert.match(file, /'Cache-Control'/);
  assert.match(file, /X-Skip-Auth-Redirect', 'Cache-Control'/);
  assert.match(file, /Accept', 'Accept-Language', 'Cache-Control'/);
});
