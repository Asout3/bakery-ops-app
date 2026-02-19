const DB_NAME = 'bakery_ops_offline_v1';
const DB_VERSION = 1;
const OPS_STORE = 'operations';
const HISTORY_STORE = 'history';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPS_STORE)) {
        const opsStore = db.createObjectStore(OPS_STORE, { keyPath: 'id' });
        opsStore.createIndex('created_at', 'created_at');
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const historyStore = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        historyStore.createIndex('created_at', 'created_at');
        historyStore.createIndex('status', 'status');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function appendHistory(entry) {
  const db = await openDb();
  const tx = db.transaction(HISTORY_STORE, 'readwrite');
  tx.objectStore(HISTORY_STORE).put(entry);
  await txPromise(tx);
  db.close();
}

export async function enqueueOperation(operation) {
  const db = await openDb();
  const tx = db.transaction(OPS_STORE, 'readwrite');
  const op = {
    id: operation.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    retries: 0,
    created_at: new Date().toISOString(),
    ...operation,
  };
  tx.objectStore(OPS_STORE).put(op);
  await txPromise(tx);
  db.close();

  await appendHistory({
    id: `${op.id}-queued-${Date.now()}`,
    operation_id: op.id,
    status: 'queued',
    message: `Queued ${op.method?.toUpperCase() || 'REQUEST'} ${op.url}`,
    created_at: new Date().toISOString(),
  });
}

export async function listQueuedOperations() {
  const db = await openDb();
  const tx = db.transaction(OPS_STORE, 'readonly');
  const req = tx.objectStore(OPS_STORE).getAll();
  const items = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  await txPromise(tx);
  db.close();
  return items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export async function listSyncHistory(limit = 200) {
  const db = await openDb();
  const tx = db.transaction(HISTORY_STORE, 'readonly');
  const req = tx.objectStore(HISTORY_STORE).getAll();
  const items = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  await txPromise(tx);
  db.close();
  return items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
}

export async function getQueueSize() {
  const items = await listQueuedOperations();
  return items.length;
}

export async function flushQueue(api) {
  if (!navigator.onLine) {
    const queued = await getQueueSize();
    return { synced: 0, failed: queued };
  }

  const queue = await listQueuedOperations();
  if (!queue.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const op of queue) {
    try {
      await api.request({
        url: op.url,
        method: op.method,
        data: op.data,
        headers: {
          ...(op.headers || {}),
          'X-Idempotency-Key': op.idempotencyKey,
          'X-Queued-Request': 'true',
          'X-Retry-Count': String(op.retries || 0),
        },
      });

      const db = await openDb();
      const tx = db.transaction(OPS_STORE, 'readwrite');
      tx.objectStore(OPS_STORE).delete(op.id);
      await txPromise(tx);
      db.close();

      synced += 1;
      await appendHistory({
        id: `${op.id}-synced-${Date.now()}`,
        operation_id: op.id,
        status: 'synced',
        message: `Synced ${op.method?.toUpperCase() || 'REQUEST'} ${op.url}`,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      failed += 1;
      const status = error?.response?.status;
      const isBusinessConflict = Number.isInteger(status) && status >= 400 && status < 500;
      const retries = (op.retries || 0) + 1;
      const db = await openDb();
      const tx = db.transaction(OPS_STORE, 'readwrite');
      if (isBusinessConflict || retries >= 5) {
        tx.objectStore(OPS_STORE).delete(op.id);
      } else {
        tx.objectStore(OPS_STORE).put({ ...op, retries, last_error: error.message || 'Sync failed' });
      }
      await txPromise(tx);
      db.close();

      await appendHistory({
        id: `${op.id}-failed-${Date.now()}`,
        operation_id: op.id,
        status: (isBusinessConflict || retries >= 5) ? 'conflict' : 'retrying',
        message: `${error.message || 'Sync failed'}${(isBusinessConflict || retries >= 5) ? ' (moved to conflict log)' : ''}`,
        created_at: new Date().toISOString(),
      });
    }
  }

  return { synced, failed };
}

export async function retryOperation(operationId) {
  const history = await listSyncHistory(1000);
  const latest = history.find((h) => h.operation_id === operationId);
  if (!latest) return;

  const queued = await listQueuedOperations();
  if (queued.find((q) => q.id === operationId)) return;

  await appendHistory({
    id: `${operationId}-manual-retry-${Date.now()}`,
    operation_id: operationId,
    status: 'manual_retry_requested',
    message: 'Manual retry requested from UI',
    created_at: new Date().toISOString(),
  });
}
