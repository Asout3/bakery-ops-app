const DB_NAME = 'bakery_ops_offline_v2';
const DB_VERSION = 2;
const OPS_STORE = 'operations';
const HISTORY_STORE = 'history';
const PAYLOAD_STORE = 'payloads';

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_BATCH_PER_FLUSH = 20;
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
  const sessionUser = typeof localStorage !== 'undefined'
    ? JSON.parse(localStorage.getItem('user') || 'null')
    : null;
  const selectedLocationId = typeof localStorage !== 'undefined' ? localStorage.getItem('selectedLocationId') : null;

  const op = {
    id,
    retries: 0,
    status: 'pending',
    created_at: new Date().toISOString(),
    nextRetry: Date.now(),
    lastAttempt: null,
    lastError: null,
    actorId: sessionUser?.id || null,
    actorName: sessionUser?.username || null,
    headers: {
      ...(operation.headers || {}),
      ...(selectedLocationId ? { 'X-Location-Id': selectedLocationId } : {}),
    },
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
    return { synced: 0, failed: 0, pending: queued, skipped: true, completed: [] };
  }

  if (!navigator.onLine) {
    const queued = await getQueueSize();
    return { synced: 0, failed: 0, pending: queued, offline: true, completed: [] };
  }

  flushInProgress = true;

  try {
    const queue = await listQueuedOperations();
    if (!queue.length) return { synced: 0, failed: 0, pending: 0, completed: [] };

    const now = Date.now();
    const readyToSync = queue
      .filter((op) => op.nextRetry <= now && op.status !== 'conflict' && op.status !== 'needs_review')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(0, MAX_BATCH_PER_FLUSH);

    if (!readyToSync.length) return { synced: 0, failed: 0, pending: queue.length, completed: [] };

    let synced = 0;
    let failed = 0;
    const completed = [];

    for (const op of readyToSync) {
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
            'X-Offline-Actor-Id': op.actorId ? String(op.actorId) : undefined,
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

        completed.push({
          operation_id: op.id,
          method: op.method,
          url: op.url,
          status: 'synced',
          retry_count: op.retries || 0,
          created_at: new Date().toISOString(),
          location_id: Number(op.headers?.['X-Location-Id'] || 0) || null,
        });
      } catch (error) {
        const statusCode = error?.response?.status;
        const isClientError = Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500;
        const isAuthOrSessionIssue = statusCode === 401 || statusCode === 403;
        const isDeterministicClientError = isClientError && !isAuthOrSessionIssue;
        const isConflict = statusCode === 409;
        const retries = (op.retries || 0) + 1;

        const db = await openDb();
        const tx = db.transaction(OPS_STORE, 'readwrite');

        let terminalStatus = null;
        let reason = resolveSyncErrorMessage(error);

        if (isAuthOrSessionIssue) {
          const updatedOp = {
            ...op,
            retries,
            status: 'needs_review',
            lastError: 'Original user session expired - requires admin review',
            lastAttempt: new Date().toISOString(),
          };
          tx.objectStore(OPS_STORE).put(updatedOp);
          terminalStatus = 'needs_review';
          reason = updatedOp.lastError;
        } else if (isConflict || statusCode === 422 || isDeterministicClientError) {
          const updatedOp = {
            ...op,
            retries,
            status: 'conflict',
            lastError: reason,
            lastAttempt: new Date().toISOString(),
          };
          tx.objectStore(OPS_STORE).put(updatedOp);
          terminalStatus = 'conflict';
        } else if (retries >= MAX_RETRIES) {
          const updatedOp = {
            ...op,
            retries,
            status: 'failed',
            lastError: reason || 'Max retries exceeded',
            lastAttempt: new Date().toISOString(),
          };
          tx.objectStore(OPS_STORE).put(updatedOp);
          terminalStatus = 'failed';
          reason = updatedOp.lastError;
        } else {
          const updatedOp = {
            ...op,
            retries,
            status: 'pending',
            nextRetry: calculateNextRetry(retries),
            lastError: reason,
            lastAttempt: new Date().toISOString(),
          };
          tx.objectStore(OPS_STORE).put(updatedOp);
        }

        await txPromise(tx);
        db.close();
        failed += 1;

        if (terminalStatus) {
          await appendHistory({
            id: `${op.id}-${terminalStatus}-${Date.now()}`,
            operation_id: op.id,
            status: terminalStatus,
            message: reason,
            created_at: new Date().toISOString(),
            retryCount: retries,
            statusCode,
          });

          completed.push({
            operation_id: op.id,
            method: op.method,
            url: op.url,
            status: terminalStatus,
            retry_count: retries,
            reason,
            created_at: new Date().toISOString(),
            location_id: Number(op.headers?.['X-Location-Id'] || 0) || null,
          });
        }
      }
    }

    const remaining = await getQueueSize();
    return { synced, failed, pending: remaining, completed };
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

async function markOperationHandled(operationId, status, note) {
  const db = await openDb();
  const tx = db.transaction(OPS_STORE, 'readwrite');
  const req = tx.objectStore(OPS_STORE).get(operationId);

  const op = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!op) {
    db.close();
    return false;
  }

  tx.objectStore(OPS_STORE).delete(operationId);
  await txPromise(tx);
  db.close();

  await deletePayload(operationId);

  await appendHistory({
    id: `${operationId}-${status}-${Date.now()}`,
    operation_id: operationId,
    status,
    message: note ? `${status} by admin: ${note}` : `${status} by admin`,
    created_at: new Date().toISOString(),
  });

  return true;
}

export async function resolveOperation(operationId, note = '') {
  return markOperationHandled(operationId, 'resolved', note);
}

export async function ignoreOperation(operationId, note = '') {
  return markOperationHandled(operationId, 'ignored', note);
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
    conflict: queue.filter(op => op.status === 'conflict').length,
    needsReview: queue.filter(op => op.status === 'needs_review').length,
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
