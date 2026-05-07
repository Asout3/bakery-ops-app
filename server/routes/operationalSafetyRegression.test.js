import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('api limiter is mounted before health and live routes', () => {
  const file = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const limiterIndex = file.indexOf("app.use('/api/', apiLimiter);");
  const healthIndex = file.indexOf("app.options('/api/health'");
  const liveIndex = file.indexOf("app.options('/api/live'");
  assert.ok(limiterIndex >= 0, 'apiLimiter mount is present');
  assert.ok(healthIndex >= 0, 'health route is present');
  assert.ok(liveIndex >= 0, 'live route is present');
  assert.ok(limiterIndex < healthIndex, 'apiLimiter should be before health route');
  assert.ok(limiterIndex < liveIndex, 'apiLimiter should be before live route');
});

test('order creation uses server-side product pricing for catalog items', () => {
  const file = fs.readFileSync(new URL('./orders.js', import.meta.url), 'utf8');
  assert.match(file, /if \(productId\) \{[\s\S]*unitPrice = normalizeNumber\(product\.price, 0\);[\s\S]*\}/);
  assert.match(file, /const subtotal = roundCurrency\(unitPrice \* qty\);/);
  assert.doesNotMatch(file, /rawItem\.subtotal/);
});
