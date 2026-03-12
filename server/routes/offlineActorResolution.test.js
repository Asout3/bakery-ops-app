import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const ROUTES = ['server/routes/orders.js', 'server/routes/payments.js', 'server/routes/expenses.js', 'server/routes/inventory.js'];

test('offline actor resolution helpers exist in write routes that consume queued actor headers', async () => {
  for (const routeFile of ROUTES) {
    const source = await fs.readFile(routeFile, 'utf8');
    assert.match(source, /async function resolveEffectiveActor\s*\(/, `${routeFile} must define resolveEffectiveActor`);
    assert.match(source, /x-offline-actor-id/, `${routeFile} must read x-offline-actor-id header`);
    assert.match(source, /x-queued-request/, `${routeFile} must read x-queued-request header`);
  }
});
