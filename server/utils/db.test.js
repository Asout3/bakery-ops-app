import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientDbError } from '../db.js';

test('isTransientDbError returns true for connection timeout patterns', () => {
  assert.equal(isTransientDbError(new Error('Connection terminated due to connection timeout')), true);
  assert.equal(isTransientDbError({ code: '08006', message: 'connection failure' }), true);
});

test('isTransientDbError returns false for validation-like errors', () => {
  assert.equal(isTransientDbError(new Error('duplicate key value violates unique constraint')), false);
});
