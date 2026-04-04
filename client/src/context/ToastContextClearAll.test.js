import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('toast context exposes clearAll helper for auth/login suppression flows', () => {
  const file = readFileSync(new URL('./ToastContext.jsx', import.meta.url), 'utf8');
  assert.match(file, /const clearAllToasts = useCallback/);
  assert.match(file, /clearAll: clearAllToasts/);
});
