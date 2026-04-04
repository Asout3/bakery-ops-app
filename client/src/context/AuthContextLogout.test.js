import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('auth logout clears session even when logout API call fails', () => {
  const file = readFileSync(new URL('./AuthContext.jsx', import.meta.url), 'utf8');
  assert.match(file, /catch \{\s*clearSession\(\);\s*setUser\(null\);\s*return;/);
});
