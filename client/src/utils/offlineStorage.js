/**
 * IndexedDB Storage Layer for Offline Operations
 * 
 * Provides 50MB+ storage capacity with:
 * - Async non-blocking operations
 * - Transaction support for atomic updates
 * - Indexed queries for efficient lookups
 * - Automatic migration from localStorage
 */

const DB_NAME = 'bakery-pos-offline';
const DB_VERSION = 1;

// Store names
const STORES = {
  OPERATIONS: 'operations',
  LOCAL_SALES: 'localSales',
  INVENTORY_CACHE: 'inventoryCache',
  METADATA: 'metadata',
  CONFLICTS: 'conflicts',
};

// Operation priorities
export const PRIORITY = {
  CRITICAL: 1,  // Sales, payments, cash drawer
  HIGH: 2,      // Inventory updates, refunds
  NORMAL: 3,    // Customer updates, order edits
  LOW: 4,       // Analytics, logs
};

// Operation statuses
export const STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed',
  CONFLICT: 'conflict',
  NEEDS_REVIEW: 'needs_review',
};

let dbInstance = null;
let dbInitPromise = null;

/**
 * Initialize and get the IndexedDB database instance
 */
export async function getDB() {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[OfflineStorage] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      
      // Handle connection errors
      dbInstance.onerror = (event) => {
        console.error('[OfflineStorage] Database error:', event.target.error);
      };

      // Handle version change (another tab upgraded the database)
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
        dbInitPromise = null;
        console.warn('[OfflineStorage] Database version changed, please refresh');
      };

      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // Create stores based on version
      if (oldVersion < 1) {
        // Operations store - main queue for offline operations
        const opsStore = db.createObjectStore(STORES.OPERATIONS, { keyPath: 'id' });
        opsStore.createIndex('status', 'status', { unique: false });
        opsStore.createIndex('priority', 'priority', { unique: false });
        opsStore.createIndex('created_at', 'created_at', { unique: false });
        opsStore.createIndex('status_priority', ['status', 'priority'], { unique: false });
        opsStore.createIndex('clientOperationId', 'clientOperationId', { unique: true });

        // Local sales store - for sales created offline
        const salesStore = db.createObjectStore(STORES.LOCAL_SALES, { keyPath: 'clientSaleId' });
        salesStore.createIndex('synced', 'synced', { unique: false });
        salesStore.createIndex('created_at', 'created_at', { unique: false });

        // Inventory cache - local inventory state
        const invStore = db.createObjectStore(STORES.INVENTORY_CACHE, { keyPath: 'productId' });
        invStore.createIndex('lastSync', 'lastSync', { unique: false });

        // Metadata store - sync state, device info
        db.createObjectStore(STORES.METADATA, { keyPath: 'key' });

        // Conflicts store - for admin review
        const conflictStore = db.createObjectStore(STORES.CONFLICTS, { keyPath: 'id' });
        conflictStore.createIndex('resolved', 'resolved', { unique: false });
        conflictStore.createIndex('created_at', 'created_at', { unique: false });
        conflictStore.createIndex('type', 'type', { unique: false });
      }
    };
  });

  return dbInitPromise;
}

/**
 * Generic transaction wrapper with retry logic
 */
async function withTransaction(storeNames, mode, callback) {
  const db = await getDB();
  const storeArray = Array.isArray(storeNames) ? storeNames : [storeNames];

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeArray, mode);
      const stores = storeArray.length === 1 
        ? tx.objectStore(storeArray[0])
        : storeArray.reduce((acc, name) => ({ ...acc, [name]: tx.objectStore(name) }), {});

      let result;

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));

      result = callback(stores, tx);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Promisify IDBRequest
 */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ==================== OPERATIONS STORE ====================

/**
 * Add a new operation to the queue
 */
export async function addOperation(operation) {
  const db = await getDB();
  
  const op = {
    id: operation.id || crypto.randomUUID(),
    clientOperationId: operation.clientOperationId || crypto.randomUUID(),
    type: operation.type,
    method: operation.method,
    url: operation.url,
    data: operation.data,
    status: STATUS.PENDING,
    priority: operation.priority || PRIORITY.NORMAL,
    checksum: operation.checksum,
    created_at: operation.created_at || Date.now(),
    attempts: 0,
    lastAttempt: null,
    lastError: null,
    userId: operation.userId,
    deviceId: operation.deviceId,
  };

  return withTransaction(STORES.OPERATIONS, 'readwrite', (store) => {
    store.add(op);
    return op;
  });
}

/**
 * Get all pending operations sorted by priority
 */
export async function getPendingOperations() {
  const db = await getDB();
  
  return withTransaction(STORES.OPERATIONS, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const index = store.index('status_priority');
      const range = IDBKeyRange.bound(
        [STATUS.PENDING, PRIORITY.CRITICAL],
        [STATUS.PENDING, PRIORITY.LOW]
      );
      
      const request = index.getAll(range);
      request.onsuccess = () => {
        // Sort by priority (ascending) then by created_at (ascending)
        const sorted = request.result.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.created_at - b.created_at;
        });
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Get operation by ID
 */
export async function getOperation(id) {
  const db = await getDB();
  
  return withTransaction(STORES.OPERATIONS, 'readonly', (store) => {
    return promisifyRequest(store.get(id));
  });
}

/**
 * Get operation by client operation ID (for idempotency)
 */
export async function getOperationByClientId(clientOperationId) {
  const db = await getDB();
  
  return withTransaction(STORES.OPERATIONS, 'readonly', (store) => {
    const index = store.index('clientOperationId');
    return promisifyRequest(index.get(clientOperationId));
  });
}

/**
 * Update an operation
 */
export async function updateOperation(id, updates) {
  const db = await getDB();
  
  return withTransaction(STORES.OPERATIONS, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          reject(new Error(`Operation ${id} not found`));
          return;
        }
        
        const updated = { ...existing, ...updates };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve(updated);
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  });
}

/**
 * Mark operation as synced
 */
export async function markOperationSynced(id, serverResponse = null) {
  return updateOperation(id, {
    status: STATUS.SYNCED,
    syncedAt: Date.now(),
    serverResponse,
  });
}

/**
 * Mark operation as failed
 */
export async function markOperationFailed(id, error, incrementAttempts = true) {
  const op = await getOperation(id);
  if (!op) return null;

  const updates = {
    lastError: typeof error === 'string' ? error : error?.message || 'Unknown error',
    lastAttempt: Date.now(),
  };

  if (incrementAttempts) {
    updates.attempts = (op.attempts || 0) + 1;
    
    // Mark as failed permanently after 10 attempts
    if (updates.attempts >= 10) {
      updates.status = STATUS.FAILED;
    }
  }

  return updateOperation(id, updates);
}

/**
 * Mark operation as conflict
 */
export async function markOperationConflict(id, conflictData) {
  return updateOperation(id, {
    status: STATUS.CONFLICT,
    conflictData,
    lastAttempt: Date.now(),
  });
}

/**
 * Delete an operation
 */
export async function deleteOperation(id) {
  const db = await getDB();
  
  return withTransaction(STORES.OPERATIONS, 'readwrite', (store) => {
    return promisifyRequest(store.delete(id));
  });
}

/**
 * Get all operations (for stats/debugging)
 */
export async function getAllOperations() {
  const db = await getDB();
  
  return withTransaction(STORES.OPERATIONS, 'readonly', (store) => {
    return promisifyRequest(store.getAll());
  });
}

/**
 * Get operations by status
 */
export async function getOperationsByStatus(status) {
  const db = await getDB();
  
  return withTransaction(STORES.OPERATIONS, 'readonly', (store) => {
    const index = store.index('status');
    return promisifyRequest(index.getAll(status));
  });
}

/**
 * Purge old synced operations (older than maxAge in ms)
 */
export async function purgeOldOperations(maxAgeMs = 24 * 60 * 60 * 1000) {
  const db = await getDB();
  const cutoff = Date.now() - maxAgeMs;
  
  return withTransaction(STORES.OPERATIONS, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const index = store.index('created_at');
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);
      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const op = cursor.value;
          // Only delete synced operations
          if (op.status === STATUS.SYNCED) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const operations = await getAllOperations();
  
  const stats = {
    total: operations.length,
    pending: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    conflict: 0,
    needsReview: 0,
    byPriority: {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    },
  };

  for (const op of operations) {
    switch (op.status) {
      case STATUS.PENDING: stats.pending++; break;
      case STATUS.SYNCING: stats.syncing++; break;
      case STATUS.SYNCED: stats.synced++; break;
      case STATUS.FAILED: stats.failed++; break;
      case STATUS.CONFLICT: stats.conflict++; break;
      case STATUS.NEEDS_REVIEW: stats.needsReview++; break;
    }

    switch (op.priority) {
      case PRIORITY.CRITICAL: stats.byPriority.critical++; break;
      case PRIORITY.HIGH: stats.byPriority.high++; break;
      case PRIORITY.NORMAL: stats.byPriority.normal++; break;
      case PRIORITY.LOW: stats.byPriority.low++; break;
    }
  }

  return stats;
}

// ==================== LOCAL SALES STORE ====================

/**
 * Save a local sale (before sync)
 */
export async function saveLocalSale(clientSaleId, saleData) {
  const db = await getDB();
  
  const sale = {
    clientSaleId,
    data: saleData,
    synced: false,
    serverId: null,
    created_at: Date.now(),
  };

  return withTransaction(STORES.LOCAL_SALES, 'readwrite', (store) => {
    store.put(sale);
    return sale;
  });
}

/**
 * Mark local sale as synced
 */
export async function markLocalSaleSynced(clientSaleId, serverId) {
  const db = await getDB();
  
  return withTransaction(STORES.LOCAL_SALES, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const getRequest = store.get(clientSaleId);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          resolve(null);
          return;
        }
        
        const updated = { ...existing, synced: true, serverId, syncedAt: Date.now() };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve(updated);
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  });
}

/**
 * Get unsynced local sales
 */
export async function getUnsyncedSales() {
  const db = await getDB();
  
  return withTransaction(STORES.LOCAL_SALES, 'readonly', (store) => {
    const index = store.index('synced');
    return promisifyRequest(index.getAll(false));
  });
}

/**
 * Get local sale by client ID
 */
export async function getLocalSale(clientSaleId) {
  const db = await getDB();
  
  return withTransaction(STORES.LOCAL_SALES, 'readonly', (store) => {
    return promisifyRequest(store.get(clientSaleId));
  });
}

// ==================== INVENTORY CACHE STORE ====================

/**
 * Update local inventory cache
 */
export async function updateInventoryCache(productId, quantity, serverQuantity = null) {
  const db = await getDB();
  
  return withTransaction(STORES.INVENTORY_CACHE, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const getRequest = store.get(productId);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result || { productId };
        
        const updated = {
          ...existing,
          localQuantity: quantity,
          serverQuantity: serverQuantity ?? existing.serverQuantity,
          lastSync: serverQuantity !== null ? Date.now() : existing.lastSync,
          lastLocalUpdate: Date.now(),
        };
        
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve(updated);
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  });
}

/**
 * Get inventory cache for a product
 */
export async function getInventoryCache(productId) {
  const db = await getDB();
  
  return withTransaction(STORES.INVENTORY_CACHE, 'readonly', (store) => {
    return promisifyRequest(store.get(productId));
  });
}

/**
 * Bulk update inventory cache from server
 */
export async function bulkUpdateInventoryCache(inventoryItems) {
  const db = await getDB();
  
  return withTransaction(STORES.INVENTORY_CACHE, 'readwrite', (store) => {
    const now = Date.now();
    
    for (const item of inventoryItems) {
      store.put({
        productId: item.id || item.productId,
        localQuantity: item.quantity,
        serverQuantity: item.quantity,
        lastSync: now,
        lastLocalUpdate: now,
      });
    }
    
    return inventoryItems.length;
  });
}

// ==================== METADATA STORE ====================

/**
 * Set metadata value
 */
export async function setMetadata(key, value) {
  const db = await getDB();
  
  return withTransaction(STORES.METADATA, 'readwrite', (store) => {
    return promisifyRequest(store.put({ key, value, updated_at: Date.now() }));
  });
}

/**
 * Get metadata value
 */
export async function getMetadata(key) {
  const db = await getDB();
  
  return withTransaction(STORES.METADATA, 'readonly', async (store) => {
    const result = await promisifyRequest(store.get(key));
    return result?.value;
  });
}

// ==================== CONFLICTS STORE ====================

/**
 * Add a conflict for admin review
 */
export async function addConflict(conflict) {
  const db = await getDB();
  
  const conflictRecord = {
    id: conflict.id || crypto.randomUUID(),
    type: conflict.type,
    operationId: conflict.operationId,
    operation: conflict.operation,
    serverState: conflict.serverState,
    clientState: conflict.clientState,
    resolved: false,
    resolvedBy: null,
    resolution: null,
    created_at: Date.now(),
  };

  return withTransaction(STORES.CONFLICTS, 'readwrite', (store) => {
    store.add(conflictRecord);
    return conflictRecord;
  });
}

/**
 * Get unresolved conflicts
 */
export async function getUnresolvedConflicts() {
  const db = await getDB();
  
  return withTransaction(STORES.CONFLICTS, 'readonly', (store) => {
    const index = store.index('resolved');
    return promisifyRequest(index.getAll(false));
  });
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(id, resolution, resolvedBy) {
  const db = await getDB();
  
  return withTransaction(STORES.CONFLICTS, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          reject(new Error(`Conflict ${id} not found`));
          return;
        }
        
        const updated = {
          ...existing,
          resolved: true,
          resolution,
          resolvedBy,
          resolvedAt: Date.now(),
        };
        
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve(updated);
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  });
}

// ==================== UTILITIES ====================

/**
 * Get estimated storage usage
 */
export async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      quota: estimate.quota || 0,
      usage: estimate.usage || 0,
      available: (estimate.quota || 0) - (estimate.usage || 0),
      percentUsed: estimate.quota ? Math.round((estimate.usage / estimate.quota) * 100) : 0,
    };
  }
  
  // Fallback: estimate based on operation count
  const stats = await getQueueStats();
  const estimatedUsage = stats.total * 2000; // ~2KB per operation estimate
  
  return {
    quota: 50 * 1024 * 1024, // Assume 50MB
    usage: estimatedUsage,
    available: 50 * 1024 * 1024 - estimatedUsage,
    percentUsed: Math.round((estimatedUsage / (50 * 1024 * 1024)) * 100),
  };
}

/**
 * Clear all data (use with caution!)
 */
export async function clearAllData() {
  const db = await getDB();
  
  const storeNames = [
    STORES.OPERATIONS,
    STORES.LOCAL_SALES,
    STORES.INVENTORY_CACHE,
    STORES.METADATA,
    STORES.CONFLICTS,
  ];

  return withTransaction(storeNames, 'readwrite', (stores) => {
    for (const name of storeNames) {
      stores[name].clear();
    }
    return true;
  });
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Export all data (for backup/debugging)
 */
export async function exportAllData() {
  const db = await getDB();
  
  const storeNames = [
    STORES.OPERATIONS,
    STORES.LOCAL_SALES,
    STORES.INVENTORY_CACHE,
    STORES.METADATA,
    STORES.CONFLICTS,
  ];

  const data = {};
  
  for (const name of storeNames) {
    data[name] = await withTransaction(name, 'readonly', (store) => {
      return promisifyRequest(store.getAll());
    });
  }

  return data;
}

export { STORES };
