import test from 'node:test';
import assert from 'node:assert/strict';
import { withAdvisoryJobLock } from './jobLockService.js';

test('withAdvisoryJobLock skips execution when lock is not acquired', async () => {
  const calls = [];
  const dbQuery = async (sql) => {
    calls.push(sql);
    if (sql.includes('pg_try_advisory_lock')) {
      return { rows: [{ acquired: false }] };
    }
    throw new Error('should not unlock when not acquired');
  };

  let executed = false;
  const result = await withAdvisoryJobLock(123, async () => {
    executed = true;
  }, dbQuery);

  assert.equal(executed, false);
  assert.equal(result.skipped, true);
  assert.equal(calls.length, 1);
});

test('withAdvisoryJobLock executes and unlocks when lock acquired', async () => {
  const calls = [];
  const dbQuery = async (sql) => {
    calls.push(sql);
    if (sql.includes('pg_try_advisory_lock')) {
      return { rows: [{ acquired: true }] };
    }
    if (sql.includes('pg_advisory_unlock')) {
      return { rows: [{ pg_advisory_unlock: true }] };
    }
    throw new Error('unexpected query');
  };

  const result = await withAdvisoryJobLock(123, async () => 'done', dbQuery);

  assert.equal(result.skipped, false);
  assert.equal(result.result, 'done');
  assert.equal(calls.length, 2);
});
