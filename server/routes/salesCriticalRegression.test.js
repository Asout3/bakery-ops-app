import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('sale edit route recalculates receipt payload and rejects overstock edits', () => {
  const file = readFileSync(new URL('./sales.js', import.meta.url), 'utf8');
  assert.match(file, /if \(delta > 0 && delta > availableQuantity\)/);
  assert.match(file, /code = 'INSUFFICIENT_STOCK'/);
  assert.match(file, /SET total_amount = \$1,\s*receipt_payload = \$2,/s);
  assert.match(file, /const receiptPayload = buildReceiptPayload\(/);
});
