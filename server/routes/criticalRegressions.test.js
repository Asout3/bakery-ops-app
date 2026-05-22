import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('inventory batch send uses one idempotency key for online request and offline enqueue fallback', () => {
  const source = fs.readFileSync(new URL('../../client/src/pages/manager/Inventory.jsx', import.meta.url), 'utf8');
  assert.match(source, /const idempotencyKey = `batch-\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2\)\}`/);
  assert.match(source, /api\.post\('\/inventory\/batches', payload, \{\s*headers: \{ 'X-Idempotency-Key': idempotencyKey \}/);
  assert.match(source, /enqueueOperation\(\{ url: '\/inventory\/batches', method: 'post', data: payload, idempotencyKey \}\)/);
});

test('staff management no longer exposes delete action buttons', () => {
  const source = fs.readFileSync(new URL('../../client/src/pages/admin/StaffManagement.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Delete<\/button>/);
  assert.doesNotMatch(source, /api\.delete\('\/admin\/staff\//);
});

test('products API enforces category_id requirement for creation and validation for update payload', () => {
  const source = fs.readFileSync(new URL('./products.js', import.meta.url), 'utf8');
  assert.match(source, /body\('category_id'\)\.isInt\(\{ min: 1 \}\)/);
  assert.match(source, /A valid category is required/);
});
