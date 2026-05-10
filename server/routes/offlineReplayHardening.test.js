import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildBatchReplaySignature, normalizeBatchItems } from '../utils/offlineReplay.js';

const OFFLINE_WRITE_ROUTES = ['sales.js', 'inventory.js', 'payments.js', 'expenses.js'];

test('normalizeBatchItems aggregates duplicates and ignores invalid rows for deterministic replay signature', () => {
  const normalized = normalizeBatchItems([
    { product_id: 5, quantity: 2 },
    { product_id: '5', quantity: 3 },
    { product_id: 8, quantity: 1 },
    { product_id: 0, quantity: 99 },
    { product_id: 11, quantity: -1 },
  ]);

  assert.deepEqual(normalized, [
    { product_id: 5, quantity: 5 },
    { product_id: 8, quantity: 1 },
  ]);
});

test('buildBatchReplaySignature is stable across item order changes', () => {
  const first = buildBatchReplaySignature({
    locationId: 2,
    actorId: 7,
    effectiveCreatedAt: '2026-05-10T12:00:00.000Z',
    notes: 'Batch sent from manager',
    items: [
      { product_id: 9, quantity: 1 },
      { product_id: 3, quantity: 4 },
      { product_id: 3, quantity: 1 },
    ],
  });

  const second = buildBatchReplaySignature({
    locationId: 2,
    actorId: 7,
    effectiveCreatedAt: '2026-05-10T12:00:00.000Z',
    notes: 'Batch sent from manager',
    items: [
      { product_id: 3, quantity: 5 },
      { product_id: 9, quantity: 1 },
    ],
  });

  assert.equal(first, second);
});

test('offline write routes enforce queued idempotency key requirement', async () => {
  for (const file of OFFLINE_WRITE_ROUTES) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(source, /x-idempotency-key/i, `${file} must read x-idempotency-key header`);
    assert.match(source, /IDEMPOTENCY_KEY_REQUIRED/, `${file} must enforce queued idempotency key requirement`);
  }
});

test('inventory route includes semantic duplicate replay guard', async () => {
  const source = await readFile(new URL('./inventory.js', import.meta.url), 'utf8');
  assert.match(source, /findSemanticallyDuplicateBatch/, 'inventory route must check for semantic duplicates before insert');
});
