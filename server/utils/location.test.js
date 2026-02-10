import test from 'node:test';
import assert from 'node:assert/strict';
import { getTargetLocationId } from './location.js';

test('non-admin always uses own location', async () => {
  const req = {
    headers: { 'x-location-id': '99' },
    query: { location_id: '88' },
    user: { id: 2, role: 'manager', location_id: 5 },
  };

  const locationId = await getTargetLocationId(req, async () => ({ rows: [] }));
  assert.equal(locationId, 5);
});

test('admin allowed location passes', async () => {
  const req = {
    headers: { 'x-location-id': '3' },
    query: {},
    user: { id: 1, role: 'admin', location_id: 1 },
  };

  const locationId = await getTargetLocationId(req, async () => ({ rows: [{ '?column?': 1 }] }));
  assert.equal(locationId, 3);
});

test('admin forbidden location throws 403', async () => {
  const req = {
    headers: { 'x-location-id': '9' },
    query: {},
    user: { id: 1, role: 'admin', location_id: 1 },
  };

  await assert.rejects(() => getTargetLocationId(req, async () => ({ rows: [] })), (err) => {
    assert.equal(err.status, 403);
    return true;
  });
});
