const DB_NAME = 'bakery_ops_offline_v2';
const DB_VERSION = 2;
const OPS_STORE = 'operations';
const HISTORY_STORE = 'history';
const PAYLOAD_STORE = 'payloads';

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_BATCH_PER_FLUSH = 20;
const TRANSIENT_HTTP_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
let flushInProgress = false;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPS_STORE)) {
        const opsStore = db.createObjectStore(OPS_STORE, { keyPath: 'id' });
        opsStore.createIndex('created_at', 'created_at');
        opsStore.createIndex('status', 'status');
        opsStore.createIndex('nextRetry', 'nextRetry');
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const historyStore = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        historyStore.createIndex('created_at', 'created_at');
        historyStore.createIndex('status', 'status');
        historyStore.createIndex('operation_id', 'operation_id');
      }
      if (!db.objectStoreNames.contains(PAYLOAD_STORE)) {
        const payloadStore = db.createObjectStore(PAYLOAD_STORE, { keyPath: 'operation_id' });
        payloadStore.createIndex('created_at', 'created_at');
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

async function storePayload(operationId, payload) {
  const db = await openDb();
  const tx = db.transaction(PAYLOAD_STORE, 'readwrite');
  tx.objectStore(PAYLOAD_STORE).put({
    operation_id: operationId,
    payload,
    created_at: new Date().toISOString(),
  });
  await txPromise(tx);
  db.close();
}

async function getPayload(operationId) {
  const db = await openDb();
  const tx = db.transaction(PAYLOAD_STORE, 'readonly');
  const req = tx.objectStore(PAYLOAD_STORE).get(operationId);
  const result = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await txPromise(tx);
  db.close();
  return result?.payload || null;
}

async function deletePayload(operationId) {
  const db = await openDb();
  const tx = db.transaction(PAYLOAD_STORE, 'readwrite');
  tx.objectStore(PAYLOAD_STORE).delete(operationId);
  await txPromise(tx);
  db.close();
}

async function appendHistory(entry) {
  const db = await openDb();
  const tx = db.transaction(HISTORY_STORE, 'readwrite');
  tx.objectStore(HISTORY_STORE).put(entry);
  await txPromise(tx);
  db.close();
}

function calculateNextRetry(retries) {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retries);
  const jitter = Math.random() * 1000;
  return Date.now() + delay + jitter;
}


function getRequestTimeout(retries) {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const quality = connection?.effectiveType || 'unknown';
  if (quality === 'slow-2g' || quality === '2g') return 25000;
  if (retries >= 3) return 20000;
  return 15000;
}


function resolveSyncErrorMessage(error) {
  return error?.response?.data?.error || error?.userMessage || error?.message || 'Sync failed';
}
export async function enqueueOperation(operation) {
  const db = await openDb();
  const id = operation.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const op = {
    id,
    retries: 0,
    status: 'pending',
    created_at: new Date().toISOString(),
    nextRetry: Date.now(),
    lastAttempt: null,
    lastError: null,
    ...operation,
  };

  const tx = db.transaction(OPS_STORE, 'readwrite');
  tx.objectStore(OPS_STORE).put(op);
  await txPromise(tx);
  db.close();

  await storePayload(id, operation.data);

  await appendHistory({
    id: `${op.id}-queued-${Date.now()}`,
    operation_id: op.id,
    status: 'queued',
    message: `Queued ${op.method?.toUpperCase() || 'REQUEST'} ${op.url}`,
    created_at: new Date().toISOString(),
  });

  return id;
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

export async function getPendingCount() {
  const items = await listQueuedOperations();
  const now = Date.now();
  return items.filter(op => op.status === 'pending' && op.nextRetry <= now).length;
}

export async function flushQueue(api) {
  if (flushInProgress) {
    const queued = await getQueueSize();
    return { synced: 0, failed: 0, pending: queued, skipped: true };
  }

  if (!navigator.onLine) {
    const queued = await getQueueSize();
    return { synced: 0, failed: 0, pending: queued, offline: true };
  }

  flushInProgress = true;

  try {
    const queue = await listQueuedOperations();
    if (!queue.length) return { synced: 0, failed: 0, pending: 0 };

    const now = Date.now();
  const readyToSync = queue
    .filter(op => op.nextRetry <= now && op.status !== 'conflict')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, MAX_BATCH_PER_FLUSH);
  
  if (!readyToSync.length) return { synced: 0, failed: 0, pending: queue.length };

  let synced = 0;
  let failed = 0;
  let shouldPauseBatch = false;

  for (const op of readyToSync) {
    if (shouldPauseBatch) break;

    const payload = await getPayload(op.id);

    try {
      const response = await api.request({
        url: op.url,
        method: op.method,
        data: payload ?? op.data,
        headers: {
          ...(op.headers || {}),
          'X-Idempotency-Key': op.idempotencyKey || op.id,
          'X-Queued-Request': 'true',
          'X-Queued-Created-At': op.created_at,
          'X-Retry-Count': String(op.retries || 0),
        },
        timeout: getRequestTimeout(op.retries || 0),
      });

      const db = await openDb();
      const tx = db.transaction(OPS_STORE, 'readwrite');
      tx.objectStore(OPS_STORE).delete(op.id);
      await txPromise(tx);
      db.close();

      await deletePayload(op.id);
      synced += 1;

      await appendHistory({
        id: `${op.id}-synced-${Date.now()}`,
        operation_id: op.id,
        status: 'synced',
        message: `Synced ${op.method?.toUpperCase()} ${op.url}`,
        created_at: new Date().toISOString(),
        response: response.data,
      });
    } catch (error) {
      const status = error?.response?.status;
      const isClientError = Number.isInteger(status) && status >= 400 && status < 500;
      const isAuthOrSessionIssue = status === 401;
      const isDeterministicClientError = isClientError && !isAuthOrSessionIssue;
      const isConflict = status === 409;
      const isTransientHttp = TRANSIENT_HTTP_CODES.has(status);
      const retries = (op.retries || 0) + 1;

      const db = await openDb();
      const tx = db.transaction(OPS_STORE, 'readwrite');

      if (isConflict || status === 422 || isDeterministicClientError) {
        const updatedOp = {
          ...op,
          retries,
          status: 'conflict',
          lastError: resolveSyncErrorMessage(error),
          lastAttempt: new Date().toISOString(),
        };
        tx.objectStore(OPS_STORE).put(updatedOp);
      } else if (retries >= MAX_RETRIES) {
        const updatedOp = {
          ...op,
          retries,
          status: 'failed',
          lastError: resolveSyncErrorMessage(error) || 'Max retries exceeded',
          lastAttempt: new Date().toISOString(),
        };
        tx.objectStore(OPS_STORE).put(updatedOp);
      } else {
        const nextRetry = calculateNextRetry(retries);
        const updatedOp = {
          ...op,
          retries,
          status: 'pending',
          nextRetry,
          lastError: resolveSyncErrorMessage(error),
          lastAttempt: new Date().toISOString(),
        };
        tx.objectStore(OPS_STORE).put(updatedOp);
      }

      await txPromise(tx);
      db.close();
      failed += 1;

      await appendHistory({
        id: `${op.id}-failed-${Date.now()}`,
        operation_id: op.id,
        status: isDeterministicClientError ? 'conflict' : (retries >= MAX_RETRIES ? 'failed' : 'retrying'),
        message: resolveSyncErrorMessage(error),
        created_at: new Date().toISOString(),
        retryCount: retries,
        statusCode: status,
      });

      const isServerUnavailable = !status || isTransientHttp;
      if (isServerUnavailable) {
        shouldPauseBatch = true;
      }
    }
  }

    const remaining = await getQueueSize();
    return { synced, failed, pending: remaining };
  } finally {
    flushInProgress = false;
  }
}

export async function retryOperation(operationId) {
  const db = await openDb();
  const tx = db.transaction(OPS_STORE, 'readwrite');
  const req = tx.objectStore(OPS_STORE).get(operationId);
  
  const op = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!op) {
    await appendHistory({
      id: `${operationId}-notfound-${Date.now()}`,
      operation_id: operationId,
      status: 'error',
      message: 'Operation not found in queue',
      created_at: new Date().toISOString(),
    });
    db.close();
    return false;
  }

  const updatedOp = {
    ...op,
    status: 'pending',
    retries: 0,
    nextRetry: Date.now(),
    lastError: null,
  };

  tx.objectStore(OPS_STORE).put(updatedOp);
  await txPromise(tx);
  db.close();

  await appendHistory({
    id: `${operationId}-manual-retry-${Date.now()}`,
    operation_id: operationId,
    status: 'pending',
    message: 'Manual retry requested from UI',
    created_at: new Date().toISOString(),
  });

  return true;
}

export async function cancelOperation(operationId) {
  const db = await openDb();
  const tx = db.transaction(OPS_STORE, 'readwrite');
  tx.objectStore(OPS_STORE).delete(operationId);
  await txPromise(tx);
  db.close();

  await deletePayload(operationId);

  await appendHistory({
    id: `${operationId}-cancelled-${Date.now()}`,
    operation_id: operationId,
    status: 'cancelled',
    message: 'Operation cancelled by user',
    created_at: new Date().toISOString(),
  });

  return true;
}

export async function clearHistory() {
  const db = await openDb();
  const tx = db.transaction(HISTORY_STORE, 'readwrite');
  tx.objectStore(HISTORY_STORE).clear();
  await txPromise(tx);
  db.close();
}

export async function getSyncStats() {
  const queue = await listQueuedOperations();
  return {
    total: queue.length,
    pending: queue.filter(op => op.status === 'pending').length,
    retrying: queue.filter(op => op.status === 'retrying').length,
    conflict: queue.filter(op => op.status === 'conflict').length,
    failed: queue.filter(op => op.status === 'failed').length,
  };
}

export function isOnline() {
  return navigator.onLine;
}

export function getConnectionQuality() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return 'unknown';
  
  if (connection.effectiveType) {
    return connection.effectiveType;
  }
  
  return 'unknown';
}

export function shouldUseOfflineMode() {
  if (!navigator.onLine) return true;
  
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return false;
  
  if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
    return true;
  }
  
  if (connection.saveData) {
    return true;
  }
  
  return false;
}
