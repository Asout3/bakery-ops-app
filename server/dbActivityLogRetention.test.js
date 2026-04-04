import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('activity log retention schema trims each location to the newest 100 rows', () => {
  const file = fs.readFileSync(new URL('./db.js', import.meta.url), 'utf8');
  assert.match(file, /export async function ensureActivityLogRetentionSchema\(/);
  assert.match(file, /CREATE INDEX IF NOT EXISTS idx_activity_log_location_created_desc/);
  assert.match(file, /CREATE OR REPLACE FUNCTION trim_activity_log_per_location\(\)/);
  assert.match(file, /OFFSET 100/);
  assert.match(file, /CREATE TRIGGER trg_trim_activity_log_per_location/);
});
