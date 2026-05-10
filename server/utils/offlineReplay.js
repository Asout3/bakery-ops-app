export function normalizeBatchItems(items = []) {
  const counts = new Map();
  for (const item of items) {
    const productId = Number(item?.product_id || 0);
    const quantity = Number(item?.quantity || 0);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0) continue;
    counts.set(productId, (counts.get(productId) || 0) + quantity);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([productId, quantity]) => ({ product_id: productId, quantity }));
}

export function buildBatchReplaySignature({ locationId, actorId, effectiveCreatedAt, items, notes }) {
  const normalizedItems = normalizeBatchItems(items);
  return JSON.stringify({
    locationId: Number(locationId || 0),
    actorId: Number(actorId || 0),
    effectiveCreatedAt: String(effectiveCreatedAt || ''),
    notes: String(notes || '').trim(),
    items: normalizedItems,
  });
}
