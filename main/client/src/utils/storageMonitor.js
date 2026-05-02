/**
 * Storage Health Monitor
 * 
 * Monitors IndexedDB storage usage and:
 * - Warns at 80% capacity
 * - Blocks new operations at 95% capacity
 * - Auto-purges synced operations older than 24 hours
 * - Provides storage status for UI display
 */

import { 
  getStorageEstimate, 
  purgeOldOperations, 
  getQueueStats,
  PRIORITY,
  STATUS,
  getAllOperations,
  deleteOperation,
} from './offlineStorage';

// Storage thresholds
const THRESHOLDS = {
  WARNING: 80,      // Show warning at 80%
  CRITICAL: 90,     // Show critical warning at 90%
  BLOCKED: 95,      // Block new non-critical operations at 95%
};

// Auto-cleanup settings
const CLEANUP = {
  MAX_AGE_MS: 24 * 60 * 60 * 1000,  // 24 hours
  CHECK_INTERVAL_MS: 5 * 60 * 1000,  // Check every 5 minutes
  MIN_SYNCED_TO_PURGE: 10,           // Don't purge if less than 10 synced ops
};

// Storage health status
export const STORAGE_HEALTH = {
  HEALTHY: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
  BLOCKED: 'blocked',
};

let monitorInterval = null;
let lastCleanupTime = 0;
let storageStatus = {
  health: STORAGE_HEALTH.HEALTHY,
  percentUsed: 0,
  quota: 0,
  usage: 0,
  available: 0,
  lastChecked: null,
  lastCleanup: null,
  cleanupStats: null,
};

// Event listeners for storage status changes
const statusListeners = new Set();

/**
 * Add listener for storage status changes
 */
export function addStorageStatusListener(callback) {
  statusListeners.add(callback);
  return () => statusListeners.delete(callback);
}

/**
 * Notify all listeners of status change
 */
function notifyListeners() {
  for (const listener of statusListeners) {
    try {
      listener({ ...storageStatus });
    } catch (err) {
      console.error('[StorageMonitor] Listener error:', err);
    }
  }
}

/**
 * Check storage health and update status
 */
export async function checkStorageHealth() {
  try {
    const estimate = await getStorageEstimate();
    const stats = await getQueueStats();
    
    let health = STORAGE_HEALTH.HEALTHY;
    
    if (estimate.percentUsed >= THRESHOLDS.BLOCKED) {
      health = STORAGE_HEALTH.BLOCKED;
    } else if (estimate.percentUsed >= THRESHOLDS.CRITICAL) {
      health = STORAGE_HEALTH.CRITICAL;
    } else if (estimate.percentUsed >= THRESHOLDS.WARNING) {
      health = STORAGE_HEALTH.WARNING;
    }

    const previousHealth = storageStatus.health;
    
    storageStatus = {
      health,
      percentUsed: estimate.percentUsed,
      quota: estimate.quota,
      usage: estimate.usage,
      available: estimate.available,
      queueStats: stats,
      lastChecked: Date.now(),
      lastCleanup: storageStatus.lastCleanup,
      cleanupStats: storageStatus.cleanupStats,
    };

    // Auto-trigger cleanup if health is degraded
    if (health !== STORAGE_HEALTH.HEALTHY) {
      await runAutoCleanup();
    }

    // Notify listeners if health changed
    if (previousHealth !== health) {
      notifyListeners();
      
      // Log health changes
      console.log(`[StorageMonitor] Health changed: ${previousHealth} -> ${health} (${estimate.percentUsed}% used)`);
    }

    return storageStatus;
  } catch (err) {
    console.error('[StorageMonitor] Health check failed:', err);
    return storageStatus;
  }
}

/**
 * Run auto-cleanup of old synced operations
 */
export async function runAutoCleanup(force = false) {
  const now = Date.now();
  
  // Don't run cleanup too frequently unless forced
  if (!force && now - lastCleanupTime < CLEANUP.CHECK_INTERVAL_MS) {
    return storageStatus.cleanupStats;
  }
  
  lastCleanupTime = now;

  try {
    const stats = await getQueueStats();
    
    // Don't purge if we have few synced operations
    if (stats.synced < CLEANUP.MIN_SYNCED_TO_PURGE && !force) {
      return { purged: 0, reason: 'not_enough_synced' };
    }

    // Purge old synced operations
    const purgedCount = await purgeOldOperations(CLEANUP.MAX_AGE_MS);
    
    // If still in critical state, try more aggressive cleanup
    let lowPriorityPurged = 0;
    if (storageStatus.health === STORAGE_HEALTH.BLOCKED || storageStatus.health === STORAGE_HEALTH.CRITICAL) {
      lowPriorityPurged = await purgeLowPriorityOperations();
    }

    const cleanupStats = {
      purged: purgedCount,
      lowPriorityPurged,
      timestamp: now,
    };

    storageStatus.lastCleanup = now;
    storageStatus.cleanupStats = cleanupStats;

    if (purgedCount > 0 || lowPriorityPurged > 0) {
      console.log(`[StorageMonitor] Cleanup: ${purgedCount} old ops, ${lowPriorityPurged} low priority ops`);
      notifyListeners();
    }

    return cleanupStats;
  } catch (err) {
    console.error('[StorageMonitor] Auto-cleanup failed:', err);
    return { purged: 0, error: err.message };
  }
}

/**
 * Purge low-priority failed/synced operations when storage is critical
 */
async function purgeLowPriorityOperations() {
  try {
    const operations = await getAllOperations();
    let purgedCount = 0;

    // Sort by priority (low first) and status (synced/failed first)
    const candidates = operations
      .filter(op => 
        (op.status === STATUS.SYNCED || op.status === STATUS.FAILED) &&
        op.priority >= PRIORITY.NORMAL
      )
      .sort((a, b) => {
        // Higher priority number = lower importance
        if (a.priority !== b.priority) return b.priority - a.priority;
        // Older operations first
        return a.created_at - b.created_at;
      });

    // Purge up to 50 low-priority operations
    const toPurge = candidates.slice(0, 50);
    
    for (const op of toPurge) {
      await deleteOperation(op.id);
      purgedCount++;
    }

    return purgedCount;
  } catch (err) {
    console.error('[StorageMonitor] Low-priority purge failed:', err);
    return 0;
  }
}

/**
 * Check if a new operation can be added based on storage health
 */
export function canAddOperation(priority = PRIORITY.NORMAL) {
  // Always allow critical operations
  if (priority === PRIORITY.CRITICAL) {
    return { allowed: true, reason: null };
  }

  // Block non-critical operations when storage is blocked
  if (storageStatus.health === STORAGE_HEALTH.BLOCKED) {
    return { 
      allowed: false, 
      reason: `Storage full (${storageStatus.percentUsed}% used). Only critical operations allowed.`,
    };
  }

  // Allow high priority in critical state
  if (storageStatus.health === STORAGE_HEALTH.CRITICAL && priority > PRIORITY.HIGH) {
    return {
      allowed: false,
      reason: `Storage critical (${storageStatus.percentUsed}% used). Only high-priority operations allowed.`,
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Get current storage status
 */
export function getStorageStatus() {
  return { ...storageStatus };
}

/**
 * Start the storage monitor
 */
export function startStorageMonitor(intervalMs = 60000) {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }

  // Initial check
  checkStorageHealth();

  // Periodic checks
  monitorInterval = setInterval(() => {
    checkStorageHealth();
  }, intervalMs);

  console.log('[StorageMonitor] Started with interval:', intervalMs, 'ms');
  
  return () => stopStorageMonitor();
}

/**
 * Stop the storage monitor
 */
export function stopStorageMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('[StorageMonitor] Stopped');
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get storage health message for UI
 */
export function getStorageHealthMessage() {
  const status = storageStatus;
  
  switch (status.health) {
    case STORAGE_HEALTH.BLOCKED:
      return {
        severity: 'error',
        title: 'Storage Full',
        message: `Storage is ${status.percentUsed}% full. Only sales can be saved. Please sync when online.`,
      };
    case STORAGE_HEALTH.CRITICAL:
      return {
        severity: 'warning',
        title: 'Storage Critical',
        message: `Storage is ${status.percentUsed}% full. Non-essential data may be lost.`,
      };
    case STORAGE_HEALTH.WARNING:
      return {
        severity: 'info',
        title: 'Storage Warning',
        message: `Storage is ${status.percentUsed}% full. Sync soon to free space.`,
      };
    default:
      return null;
  }
}

export { THRESHOLDS, CLEANUP };
