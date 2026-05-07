import test from 'node:test';
import assert from 'node:assert/strict';
import { getTargetLocationId } from './location.js';

test('non-admin always uses own location', async () => {
  const req = {
    headers: { 'x-location-id': '99' },
    query: { location_id: '88' },
    user: { id: 2, role: 'manager', location_id: 5 },
  };

  const locationId = await getTargetLocationId(req, async (sql, params) => {
    if (sql.includes('FROM locations') && sql.includes('WHERE id = $1') && Number(params?.[0]) === 5) {
      return { rows: [{ id: 5 }] };
    }
    return { rows: [] };
  });
  assert.equal(locationId, 5);
});

test('admin allowed location passes', async () => {
  const req = {
    headers: { 'x-location-id': '3' },
    query: {},
    user: { id: 1, role: 'admin', location_id: 1 },
  };

  const locationId = await getTargetLocationId(req, async () => ({ rows: [{ id: 3 }] }));
  assert.equal(locationId, 3);
});

test('admin with no explicit assignments can access requested location', async () => {
  const req = {
    headers: { 'x-location-id': '9' },
    query: {},
    user: { id: 1, role: 'admin', location_id: null },
  };

  const locationId = await getTargetLocationId(req, async (sql, params) => {
    if (sql.includes('FROM locations') && sql.includes('WHERE id = $1') && Number(params?.[0]) === 9) {
      return { rows: [{ id: 9 }] };
    }
    return { rows: [] };
  });
  assert.equal(locationId, 9);
});

test('throws 400 when requested location does not exist', async () => {
  const req = {
    headers: { 'x-location-id': '1' },
    query: {},
    user: { id: 1, role: 'admin', location_id: null },
  };

  await assert.rejects(() => getTargetLocationId(req, async (sql, params) => {
    if (sql.includes('FROM locations') && sql.includes('WHERE id = $1') && Number(params?.[0]) === 1) {
      return { rows: [] };
    }
    return { rows: [] };
  }), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
});

test('admin forbidden location throws 403 when assignments exist', async () => {
  const req = {
    headers: { 'x-location-id': '9' },
    query: {},
    user: { id: 1, role: 'admin', location_id: 1 },
  };

  await assert.rejects(() => getTargetLocationId(req, async () => ({ rows: [{ id: 2 }, { id: 3 }] })), (err) => {
    assert.equal(err.status, 403);
    return true;
  });
});

test('throws 400 when no location is supplied', async () => {
  const req = {
    headers: {},
    query: {},
    user: { id: 1, role: 'admin', location_id: null },
  };

  await assert.rejects(() => getTargetLocationId(req, async () => ({ rows: [] })), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
});

test('does not auto-create default location when no location is supplied', async () => {
  const req = {
    headers: {},
    query: {},
    user: { id: 1, role: 'admin', location_id: null },
  };

  let insertCalled = false;
  await assert.rejects(() => getTargetLocationId(req, async (sql) => {
    if (sql.includes('INSERT INTO locations')) insertCalled = true;
    return { rows: [] };
  }), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
  assert.equal(insertCalled, false);
});
