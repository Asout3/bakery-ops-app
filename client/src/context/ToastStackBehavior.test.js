import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('toast stack supports scrolling and exit animation polish', () => {
  const file = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(file, /\.toast-stack[\s\S]*overflow-y:\s*auto;/);
  assert.match(file, /@keyframes toastExit/);
  assert.match(file, /animation-delay:\s*0s,\s*0s,\s*calc\(var\(--toast-duration, 10000ms\) - 340ms\);/);
});
