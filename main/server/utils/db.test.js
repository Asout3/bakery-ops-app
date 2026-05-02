import test from 'node:test';
import assert from 'node:assert/strict';
import pool, { isTransientDbError, withTransaction } from '../db.js';

test('isTransientDbError returns true for connection timeout patterns', () => {
  assert.equal(isTransientDbError(new Error('Connection terminated due to connection timeout')), true);
  assert.equal(isTransientDbError({ code: '08006', message: 'connection failure' }), true);
});

test('isTransientDbError returns false for validation-like errors', () => {
  assert.equal(isTransientDbError(new Error('duplicate key value violates unique constraint')), false);
});

test('withTransaction annotates transient connection failures from pool.connect', async (t) => {
  const originalConnect = pool.connect;
  t.after(() => {
    pool.connect = originalConnect;
  });

  pool.connect = async () => {
    const err = new Error('Connection terminated due to connection timeout');
    err.code = '08006';
    throw err;
  };

  await assert.rejects(
    () => withTransaction(async () => ({ ok: true })),
    (error) => error.status === 503 && error.code === '08006'
  );
});

test('withTransaction keeps client for non-transient business errors', async (t) => {
  const originalConnect = pool.connect;
  t.after(() => {
    pool.connect = originalConnect;
  });

  let releaseArg;
  const fakeClient = {
    async query(sql) {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return;
      throw new Error('business validation failure');
    },
    release(arg) {
      releaseArg = arg;
    },
  };

  pool.connect = async () => fakeClient;

  await assert.rejects(
    () => withTransaction(async (tx) => tx.query('SELECT 1')),
    (error) => error.message.includes('business validation failure')
  );

  assert.equal(releaseArg, false);
});
