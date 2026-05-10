import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildBatchReplaySignature, normalizeBatchItems } from '../utils/offlineReplay.js';

const OFFLINE_WRITE_ROUTES = ['sales.js', 'inventory.js', 'payments.js', 'expenses.js'];
const CASHIER_CRITICAL_ROUTES = ['sales.js', 'inventory.js'];

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

test('cashier critical write routes keep transaction + advisory-lock idempotency protections', async () => {
  for (const file of CASHIER_CRITICAL_ROUTES) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(source, /withTransaction\s*\(/, `${file} must use transaction wrapper for writes`);
    assert.match(source, /pg_advisory_xact_lock/, `${file} must use advisory lock for idempotent queued writes`);
    assert.match(source, /idempotency_keys/, `${file} must persist idempotency responses`);
  }
});

test('deployment guide includes staged rollout controls and health gate checks', async () => {
  const source = await readFile(new URL('../../DEPLOYMENT.md', import.meta.url), 'utf8');
  assert.match(source, /Operational Checks/i, 'DEPLOYMENT guide must include operational checks');
  assert.match(source, /health|ready|live/i, 'DEPLOYMENT guide must include health/readiness probes');
  assert.match(source, /Multi-instance Considerations/i, 'DEPLOYMENT guide must include multi-instance rollout guidance');
});

test('sync route preserves replay observability statuses for audit and manual resolution', async () => {
  const source = await readFile(new URL('./sync.js', import.meta.url), 'utf8');
  assert.match(source, /synced/, 'sync route should track synced status');
  assert.match(source, /failed/, 'sync route should track failed status');
  assert.match(source, /conflict/, 'sync route should track conflict status');
  assert.match(source, /needs_review/, 'sync route should track needs_review status');
  assert.match(source, /resolved/, 'sync route should support admin resolution');
  assert.match(source, /ignored/, 'sync route should support admin ignore workflow');
});
