import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('health/live OPTIONS CORS wildcard is limited to non-production', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(source, /app\.options\('\/api\/health',[\s\S]*NODE_ENV !== 'production'[\s\S]*Access-Control-Allow-Origin/);
  assert.match(source, /app\.options\('\/api\/live',[\s\S]*NODE_ENV !== 'production'[\s\S]*Access-Control-Allow-Origin/);
});
