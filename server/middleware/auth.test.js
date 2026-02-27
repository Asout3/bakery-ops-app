import test from 'node:test';
import assert from 'node:assert/strict';

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

test('authenticateToken includes requestId when token is missing', async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
  const { authenticateToken } = await import('./auth.js');
  const req = { headers: {}, requestId: 'req-auth-1' };
  const res = createRes();

  authenticateToken(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.code, 'AUTH_TOKEN_REQUIRED');
  assert.equal(res.payload.requestId, 'req-auth-1');
});
