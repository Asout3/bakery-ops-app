import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueOperation,
  flushQueue,
  listQueuedOperations,
  listSyncHistory,
  retryOperation,
  cancelOperation,
  clearHistory,
} from '../../client/src/utils/offlineQueue.js';

function buildIndexedDbMock() {
  const databases = new Map();

  function ensureStore(dbState, name) {
    if (!dbState.stores.has(name)) {
      dbState.stores.set(name, new Map());
    }
    return dbState.stores.get(name);
  }

  function createRequest(result, error = null) {
    const request = { result, error, onsuccess: null, onerror: null };
    setTimeout(() => {
      if (error) {
        if (request.onerror) request.onerror();
        return;
      }
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }

  function createTransaction(dbState, storeName) {
    const store = ensureStore(dbState, storeName);
    let completeHandler = null;

    const tx = { onerror: null, onabort: null };
    Object.defineProperty(tx, 'oncomplete', {
      get() {
        return completeHandler;
      },
      set(value) {
        completeHandler = value;
        if (completeHandler) {
          setTimeout(() => completeHandler(), 0);
        }
      },
      configurable: true,
    });

    const objectStore = {
      put(value) {
        store.set(value.id || value.operation_id, structuredClone(value));
        return createRequest(value);
      },
      get(key) {
        const value = store.has(key) ? structuredClone(store.get(key)) : undefined;
        return createRequest(value);
      },
      getAll() {
        const value = Array.from(store.values()).map((item) => structuredClone(item));
        return createRequest(value);
      },
      delete(key) {
        store.delete(key);
        return createRequest(undefined);
      },
      clear() {
        store.clear();
        return createRequest(undefined);
      },
      createIndex() {},
    };

    tx.objectStore = () => objectStore;
    return tx;
  }


  return {
    open(name) {
      if (!databases.has(name)) {
        databases.set(name, { stores: new Map() });
      }
      const dbState = databases.get(name);
      const request = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };

      setTimeout(() => {
        const db = {
          objectStoreNames: {
            contains(storeName) {
              return dbState.stores.has(storeName);
            },
          },
          createObjectStore(storeName) {
            ensureStore(dbState, storeName);
            return { createIndex() {} };
          },
          transaction(storeName) {
            return createTransaction(dbState, storeName);
          },
          close() {},
        };
        request.result = db;
        if (request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      }, 0);

      return request;
    },
  };
}

function createApiStub(outcomes) {
  const requests = [];
  let call = 0;

  return {
    requests,
    api: {
      async request(config) {
        requests.push(config);
        const outcome = outcomes[Math.min(call, outcomes.length - 1)];
        call += 1;
        if (outcome.type === 'success') {
          return { data: outcome.data || { ok: true } };
        }
        const err = new Error(outcome.message || 'request failed');
        if (outcome.status) {
          err.response = { status: outcome.status, data: { error: outcome.message || 'error' } };
        }
        throw err;
      },
    },
  };
}

test.beforeEach(async () => {
  globalThis.indexedDB = buildIndexedDbMock();
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      onLine: true,
      connection: { effectiveType: '4g' },
    },
    configurable: true,
  });
  await clearHistory();
  const queued = await listQueuedOperations();
  await Promise.all(queued.map((op) => cancelOperation(op.id)));
});

test('flushQueue keeps processing queue even when one operation fails transiently', async () => {
  await enqueueOperation({ id: 'op-1', url: '/api/sales', method: 'post', data: { n: 1 } });
  await enqueueOperation({ id: 'op-2', url: '/api/sales', method: 'post', data: { n: 2 } });

  const { api, requests } = createApiStub([
    { type: 'error', status: 503, message: 'Database unavailable' },
    { type: 'success' },
  ]);

  const result = await flushQueue(api);
  const queued = await listQueuedOperations();

  assert.equal(requests.length, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.synced, 1);
  assert.equal(queued.length, 1);
  assert.equal(queued.find((op) => op.id === 'op-1').status, 'pending');
});

test('flushQueue marks deterministic client errors as conflict', async () => {
  await enqueueOperation({ id: 'conflict-op', url: '/api/sales', method: 'post', data: { n: 1 } });
  const { api } = createApiStub([{ type: 'error', status: 409, message: 'Duplicate request' }]);

  await flushQueue(api);
  const queued = await listQueuedOperations();

  assert.equal(queued.length, 1);
  assert.equal(queued[0].status, 'conflict');
});

test('flushQueue limits overlapping calls with skip response', async () => {
  await enqueueOperation({ id: 'slow-op', url: '/api/sales', method: 'post', data: { n: 1 } });

  let release;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });

  const api = {
    async request() {
      await blocker;
      return { data: { ok: true } };
    },
  };

  const first = flushQueue(api);
  const second = await flushQueue(api);
  release();
  await first;

  assert.equal(second.skipped, true);
});

test('retryOperation resets a conflicted operation to pending', async () => {
  await enqueueOperation({ id: 'retry-op', url: '/api/sales', method: 'post', data: { n: 1 } });
  const { api } = createApiStub([{ type: 'error', status: 422, message: 'Validation' }]);
  await flushQueue(api);

  const didRetry = await retryOperation('retry-op');
  const queued = await listQueuedOperations();

  assert.equal(didRetry, true);
  assert.equal(queued[0].status, 'pending');
  assert.equal(queued[0].retries, 0);
});

test('sync history logs failure and success events for traceability', async () => {
  await enqueueOperation({ id: 'hist-1', url: '/api/sales', method: 'post', data: { n: 1 } });
  await enqueueOperation({ id: 'hist-2', url: '/api/sales', method: 'post', data: { n: 2 } });

  const { api } = createApiStub([
    { type: 'error', message: 'Network error' },
    { type: 'success', data: { id: 22 } },
  ]);

  await flushQueue(api);
  globalThis.navigator.onLine = true;
  await flushQueue(api);

  const history = await listSyncHistory(20);

  assert.ok(history.some((entry) => entry.status === 'queued'));
  assert.ok(history.some((entry) => entry.status === 'synced'));
});


test('flushQueue returns offline state and keeps queue intact when navigator is offline', async () => {
  await enqueueOperation({ id: 'offline-op', url: '/api/sales', method: 'post', data: { n: 1 } });
  globalThis.navigator.onLine = false;

  const api = {
    async request() {
      throw new Error('should not be called while offline');
    },
  };

  const result = await flushQueue(api);
  const queued = await listQueuedOperations();

  assert.equal(result.offline, true);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].id, 'offline-op');
});

test('flushQueue uses payload store data when operation object data is missing', async () => {
  await enqueueOperation({ id: 'payload-op', url: '/api/sales', method: 'post', data: { n: 42 } });

  const requests = [];
  const api = {
    async request(config) {
      requests.push(config);
      return { data: { ok: true } };
    },
  };

  await flushQueue(api);

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].data, { n: 42 });
});

test('flushQueue adapts request timeout for slow connections', async () => {
  await enqueueOperation({ id: 'slow-conn-op', url: '/api/sales', method: 'post', data: { n: 1 } });
  globalThis.navigator.connection.effectiveType = '2g';

  const requests = [];
  const api = {
    async request(config) {
      requests.push(config);
      return { data: { ok: true } };
    },
  };

  await flushQueue(api);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].timeout, 25000);
});

test('flushQueue continues processing after HTTP 429 and keeps failed op pending', async () => {
  await enqueueOperation({ id: 'rate-op-1', url: '/api/sales', method: 'post', data: { n: 1 } });
  await enqueueOperation({ id: 'rate-op-2', url: '/api/sales', method: 'post', data: { n: 2 } });

  const { api, requests } = createApiStub([
    { type: 'error', status: 429, message: 'Too many requests' },
    { type: 'success' },
  ]);

  const result = await flushQueue(api);
  const queued = await listQueuedOperations();

  assert.equal(requests.length, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.synced, 1);
  assert.equal(queued.length, 1);
  assert.equal(queued.find((op) => op.id === 'rate-op-1').status, 'conflict');
});
