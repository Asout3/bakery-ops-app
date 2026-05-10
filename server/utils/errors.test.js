import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, errorHandler } from './errors.js';

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

test('errorHandler returns standardized AppError payload', () => {
  const req = { requestId: 'req-test', headers: {}, path: '/x', method: 'GET' };
  const res = createRes();

  errorHandler(new AppError('Validation failed', 400, 'VALIDATION_ERROR'), req, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'Validation failed');
  assert.equal(res.payload.code, 'VALIDATION_ERROR');
  assert.equal(res.payload.requestId, 'req-test');
});

test('errorHandler returns standardized payload for generic errors', () => {
  const req = { requestId: 'req-generic', headers: {}, path: '/x', method: 'GET' };
  const res = createRes();

  errorHandler(new Error('boom'), req, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.code, 'INTERNAL_ERROR');
  assert.equal(res.payload.requestId, 'req-generic');
  assert.ok(typeof res.payload.error === 'string');
});
