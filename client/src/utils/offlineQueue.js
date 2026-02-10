const QUEUE_KEY = 'offline_ops_queue_v1';

const readQueue = () => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
};

const writeQueue = (queue) => localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

export const enqueueOperation = (operation) => {
  const queue = readQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    retries: 0,
    created_at: new Date().toISOString(),
    ...operation,
  });
  writeQueue(queue);
};

export const getQueueSize = () => readQueue().length;

export const flushQueue = async (api) => {
  if (!navigator.onLine) return { synced: 0, failed: getQueueSize() };

  const queue = readQueue();
  if (!queue.length) return { synced: 0, failed: 0 };

  const remaining = [];
  let synced = 0;

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
        },
      });
      synced += 1;
    } catch {
      const retries = (op.retries || 0) + 1;
      if (retries < 5) {
        remaining.push({ ...op, retries });
      }
    }
  }

  writeQueue(remaining);
  return { synced, failed: remaining.length };
};
