import { getSessionSnapshot } from './authSession.js';
const DB_NAME = 'bakery_ops_offline_v2';
const DB_VERSION = 2;
const OPS_STORE = 'operations';
const HISTORY_STORE = 'history';
const PAYLOAD_STORE = 'payloads';

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_BATCH_PER_FLUSH = 20;
const MAX_FLUSH_CYCLES = 25;
const MAX_QUEUE_OPERATIONS = 500;
const MAX_HISTORY_ENTRIES = 1000;
const MAX_OPERATION_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RETENTION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let flushLockToken = null;
let lastRetentionSweepAt = 0;
let retentionSweepPromise = null;


function tryAcquireFlushLock() {
  if (flushLockToken) return null;
  const token = Symbol('offline-queue-flush');
  flushLockToken = token;
  return token;
}

function releaseFlushLock(token) {
  if (flushLockToken === token) {
    flushLockToken = null;
  }
}

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

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createdAtRange(cutoffIso) {
  if (typeof IDBKeyRange === 'undefined') return undefined;
  return IDBKeyRange.upperBound(cutoffIso);
}

async function deleteByCreatedAtCursor({ storeName, maxAgeMs, maxDeletes = Infinity }) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const source = typeof store.index === 'function' ? store.index('created_at') : store;
  if (typeof source.openCursor !== 'function') {
    await txPromise(tx);
    db.close();
    return [];
  }

  const deletedIds = [];
  const cutoffIso = new Date(Date.now() - maxAgeMs).toISOString();
  const range = createdAtRange(cutoffIso);
  await new Promise((resolve, reject) => {
    const request = source.openCursor(range);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || deletedIds.length >= maxDeletes) {
        resolve();
        return;
      }
      if (!range && String(cursor.value?.created_at || '') > cutoffIso) {
        resolve();
        return;
      }
      const id = storeName === PAYLOAD_STORE ? cursor.value?.operation_id : cursor.value?.id;
      if (id) deletedIds.push(id);
      cursor.delete();
      cursor.continue();
    };
  });

  await txPromise(tx);
  db.close();
  return deletedIds;
}

async function pruneOldestByCount(storeName, maxEntries) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const source = typeof store.index === 'function' ? store.index('created_at') : store;
  if (typeof store.count !== 'function' || typeof source.openCursor !== 'function') {
    await txPromise(tx);
    db.close();
    return [];
  }

  const total = Number(await requestPromise(store.count()) || 0);
  const deleteTarget = Math.max(0, total - maxEntries);
  const deletedIds = [];
  if (deleteTarget > 0) {
    await new Promise((resolve, reject) => {
      const request = source.openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || deletedIds.length >= deleteTarget) {
          resolve();
          return;
        }
        const id = storeName === PAYLOAD_STORE ? cursor.value?.operation_id : cursor.value?.id;
        if (id) deletedIds.push(id);
        cursor.delete();
        cursor.continue();
      };
    });
  }

  await txPromise(tx);
  db.close();
  return deletedIds;
}

async function pruneStoreByCreatedAt(storeName, { maxEntries, maxAgeMs }) {
  const staleIds = await deleteByCreatedAtCursor({ storeName, maxAgeMs });
  const overflowIds = await pruneOldestByCount(storeName, maxEntries);
  return [...new Set([...staleIds, ...overflowIds])];
}

async function deletePayloadsForOperations(operationIds) {
  if (!operationIds.length) return;
  const db = await openDb();
  const tx = db.transaction(PAYLOAD_STORE, 'readwrite');
  const store = tx.objectStore(PAYLOAD_STORE);
  operationIds.forEach((operationId) => store.delete(operationId));
  await txPromise(tx);
  db.close();
}

async function runRetentionSweep() {
  const staleOperationIds = await pruneStoreByCreatedAt(OPS_STORE, { maxEntries: MAX_QUEUE_OPERATIONS, maxAgeMs: MAX_OPERATION_AGE_MS });
  if (staleOperationIds.length) {
    await appendHistory({
      id: `queue-pruned-${Date.now()}`,
      operation_id: 'retention',
      status: 'pruned',
      message: `Pruned ${staleOperationIds.length} stale queued operation(s).`,
      created_at: new Date().toISOString(),
    });
    await deletePayloadsForOperations(staleOperationIds);
  }
  await pruneStoreByCreatedAt(HISTORY_STORE, { maxEntries: MAX_HISTORY_ENTRIES, maxAgeMs: MAX_HISTORY_AGE_MS });
  await deleteByCreatedAtCursor({ storeName: PAYLOAD_STORE, maxAgeMs: MAX_OPERATION_AGE_MS });
}

async function enforceRetentionLimits({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRetentionSweepAt < RETENTION_SWEEP_INTERVAL_MS) return;
  if (retentionSweepPromise) return retentionSweepPromise;

  retentionSweepPromise = runRetentionSweep()
    .then(() => {
      lastRetentionSweepAt = Date.now();
    })
    .finally(() => {
      retentionSweepPromise = null;
    });
  return retentionSweepPromise;
}

async function appendHistory(entry) {
  const db = await openDb();
  const tx = db.transaction(HISTORY_STORE, 'readwrite');
  tx.objectStore(HISTORY_STORE).put(entry);
  await txPromise(tx);
  db.close();
}


function isAuxiliaryOperation(op = {}) {
  return ['/sales/print-events', '/sync/audit/bulk'].includes(op.url);
}

function countUserVisibleOperations(ops = []) {
  return ops.filter((op) => !isAuxiliaryOperation(op)).length;
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
  const errorCode = error?.response?.data?.code;
  const details = error?.response?.data?.details;
  if (errorCode === 'INSUFFICIENT_STOCK' && details?.product_name) {
    return `${details.product_name} is out of stock (${Number(details.available_quantity || 0)} available, ${Number(details.requested_quantity || 0)} requested). Restock then retry sync.`;
  }
  return error?.response?.data?.error || error?.userMessage || error?.message || 'Sync failed';
}

function tryBuildAdjustedSalePayload(op, error) {
  if (String(op?.url || '') !== '/sales') return null;
  const statusCode = Number(error?.response?.status || 0);
  const errorCode = String(error?.response?.data?.code || '');
  if (statusCode !== 400 || errorCode !== 'INSUFFICIENT_STOCK') return null;

  const details = error?.response?.data?.details || {};
  const productId = Number(details.product_id || 0);
  const availableQty = Math.max(0, Number(details.available_quantity || 0));
  if (!productId || !Array.isArray(op?.data?.items)) return null;

  const nextItems = op.data.items
    .map((item) => {
      if (Number(item.product_id) !== productId) return item;
      if (availableQty <= 0) return null;
      return { ...item, quantity: Math.max(0, Math.min(Number(item.quantity || 0), availableQty)) };
    })
    .filter((item) => item && Number(item.quantity || 0) > 0);

  if (!nextItems.length) return { adjusted: false, reason: 'No sellable quantity remains for this sale after stock reconciliation.' };
  if (JSON.stringify(nextItems) === JSON.stringify(op.data.items)) return null;

  return {
    adjusted: true,
    payload: { ...op.data, items: nextItems },
    reason: `Queued sale needs review: only ${availableQty} available for product ${productId}, but ${Number(op.data.items.find((item) => Number(item.product_id) === productId)?.quantity || 0)} requested.`,
  };
}
export async function enqueueOperation(operation) {
  await enforceRetentionLimits();
  const id = operation.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sessionUser = getSessionSnapshot()?.user || null;
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

  const db = await openDb();
  const tx = db.transaction(OPS_STORE, 'readwrite');
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

  const payload = operation.data;
  const payloadDb = await openDb();
  const payloadTx = payloadDb.transaction(PAYLOAD_STORE, 'readwrite');
  payloadTx.objectStore(PAYLOAD_STORE).put({ operation_id: id, payload, created_at: new Date().toISOString() });
  await txPromise(payloadTx);
  payloadDb.close();

  return id;
}

export async function listQueuedOperations() {
  await enforceRetentionLimits();
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
  await enforceRetentionLimits();
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
  return items.filter((op) => op.status === 'pending' && Number(op.nextRetry || 0) <= now).length;
}

async function getReadyPendingOperations(limit = MAX_BATCH_PER_FLUSH) {
  const items = await listQueuedOperations();
  const now = Date.now();
  return items
    .filter((op) => op.status === 'pending' && Number(op.nextRetry || 0) <= now)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, limit);
}

export async function flushQueue(api) {
  const lockToken = tryAcquireFlushLock();
  if (!lockToken) {
    const queued = await getQueueSize();
    return { synced: 0, failed: 0, pending: queued, skipped: true, completed: [] };
  }

  if (!navigator.onLine) {
    const queued = await getQueueSize();
    releaseFlushLock(lockToken);
    return { synced: 0, failed: 0, pending: queued, offline: true, completed: [] };
  }

  try {
    const queued = await getQueueSize();
    if (!queued) return { synced: 0, failed: 0, pending: 0, completed: [] };

    let synced = 0;
    let failed = 0;
    let visibleSynced = 0;
    let visibleFailed = 0;
    const completed = [];

    for (let cycle = 0; cycle < MAX_FLUSH_CYCLES; cycle += 1) {
      const readyToSync = await getReadyPendingOperations(MAX_BATCH_PER_FLUSH);
      if (!readyToSync.length) break;
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
        if (!isAuxiliaryOperation(op)) visibleSynced += 1;

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
          actor_user_id: op.actorId || null,
          actor_username: op.actorName || null,
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

        const adjustedSale = tryBuildAdjustedSalePayload(op, error);
        if (adjustedSale) {
          reason = adjustedSale.reason;
        }

        if (isAuthOrSessionIssue) {
          if (retries >= MAX_RETRIES) {
            const updatedOp = {
              ...op,
              retries,
              status: 'failed',
              lastError: 'Sync authorization failed after multiple retries. Please review user access for this action.',
              lastAttempt: new Date().toISOString(),
            };
            tx.objectStore(OPS_STORE).put(updatedOp);
            terminalStatus = 'failed';
            reason = updatedOp.lastError;
          } else {
            const sessionUser = getSessionSnapshot()?.user || null;
            const updatedOp = {
              ...op,
              retries,
              status: 'pending',
              actorId: op.actorId || sessionUser?.id || null,
              actorName: op.actorName || sessionUser?.username || null,
              nextRetry: calculateNextRetry(retries),
              lastError: 'Queued action will retry with the active session.',
              lastAttempt: new Date().toISOString(),
            };
            tx.objectStore(OPS_STORE).put(updatedOp);
          }
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
        if (!isAuxiliaryOperation(op)) visibleFailed += 1;

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
            actor_user_id: op.actorId || null,
            actor_username: op.actorName || null,
          });
        }
      }
    }
  }

    if (visibleSynced > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offline-queue-synced', {
        detail: {
          synced: visibleSynced,
          failed: visibleFailed,
          at: new Date().toISOString(),
        },
      }));
    }

    const remainingQueue = await listQueuedOperations();
    const remaining = remainingQueue.length;
    return { synced, failed, pending: remaining, visibleSynced, visibleFailed, visiblePending: countUserVisibleOperations(remainingQueue), completed };
  } finally {
    releaseFlushLock(lockToken);
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
  const visibleQueue = queue.filter((op) => !isAuxiliaryOperation(op));
  const terminalAuxiliary = queue.filter((op) => isAuxiliaryOperation(op) && ['conflict', 'failed', 'needs_review'].includes(op.status));
  return {
    total: visibleQueue.length,
    pending: visibleQueue.filter(op => op.status === 'pending').length,
    conflict: visibleQueue.filter(op => op.status === 'conflict').length + terminalAuxiliary.filter((op) => op.status === 'conflict').length,
    needsReview: visibleQueue.filter(op => op.status === 'needs_review').length + terminalAuxiliary.filter((op) => op.status === 'needs_review').length,
    failed: visibleQueue.filter(op => op.status === 'failed').length + terminalAuxiliary.filter((op) => op.status === 'failed').length,
    auxiliaryPending: queue.filter((op) => isAuxiliaryOperation(op) && op.status === 'pending').length,
    auxiliaryTotal: queue.filter((op) => isAuxiliaryOperation(op)).length,
  };
}

// Track actual backend connectivity state (not just navigator.onLine)
let _backendReachable = navigator.onLine;
let _lastBackendCheck = 0;
const BACKEND_CHECK_INTERVAL_MS = 30000; // 30 seconds
const BACKEND_CHECK_TIMEOUT_MS = 8000; // 8 second timeout

export function isOnline() {
  // Both browser AND backend must be reachable
  return navigator.onLine && _backendReachable;
}

export function getBackendReachable() {
  return _backendReachable;
}

export function setBackendReachable(reachable) {
  const changed = _backendReachable !== reachable;
  _backendReachable = reachable;
  _lastBackendCheck = Date.now();
  
  if (changed) {
    // Dispatch custom event so components can react
    window.dispatchEvent(new CustomEvent('backend-connectivity-change', { 
      detail: { reachable, timestamp: _lastBackendCheck } 
    }));
  }
  
  return changed;
}

// Active health check against the backend
export async function checkBackendConnectivity(apiBaseUrl) {
  if (!navigator.onLine) {
    setBackendReachable(false);
    return false;
  }

  const now = Date.now();
  // Don't hammer the health endpoint
  if (now - _lastBackendCheck < 5000 && _lastBackendCheck > 0) {
    return _backendReachable;
  }

  // Try primary health check first, then fallback to simpler live endpoint
  const endpoints = ['/health', '/live'];
  
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), BACKEND_CHECK_TIMEOUT_MS);

      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setBackendReachable(true);
        console.log('[OfflineQueue] Backend reachable via', endpoint);
        return true;
      }
    } catch (err) {
      console.warn(`[OfflineQueue] Backend check via ${endpoint} failed:`, err.message);
      // Continue to next endpoint
    }
  }

  // All endpoints failed
  console.warn('[OfflineQueue] Backend unreachable - all health endpoints failed');
  setBackendReachable(false);
  return false;
}

export function shouldCheckBackendConnectivity() {
  return Date.now() - _lastBackendCheck > BACKEND_CHECK_INTERVAL_MS;
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
  // If backend is not reachable, use offline mode
  if (!isOnline()) return true;
  
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
