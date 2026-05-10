import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('notification schema bootstrap is wired at server startup', async () => {
  const dbFile = await readFile(new URL('../db.js', import.meta.url), 'utf8');
  const indexFile = await readFile(new URL('../index.js', import.meta.url), 'utf8');

  assert.match(dbFile, /export async function ensureNotificationsSchema\(\)/);
  assert.match(dbFile, /CREATE TABLE IF NOT EXISTS notifications/);
  assert.match(indexFile, /ensureNotificationsSchema/);
  assert.match(indexFile, /await ensureNotificationsSchema\(\)/);
});
