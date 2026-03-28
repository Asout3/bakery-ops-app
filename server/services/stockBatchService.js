import { query } from '../db.js';

let stockBatchSchemaPromise = null;

function getDbExecutor(dbOrQuery) {
  if (typeof dbOrQuery === 'function') {
    return { query: dbOrQuery };
  }
  return dbOrQuery;
}

function normalizeQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function normalizeShelfLifeDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

function computeExpiresAt(createdAt, shelfLifeDays) {
  const normalizedDays = normalizeShelfLifeDays(shelfLifeDays);
  if (normalizedDays === null) return null;

  const base = createdAt ? new Date(createdAt) : new Date();
  if (Number.isNaN(base.getTime())) return null;

  const utcYear = base.getUTCFullYear();
  const utcMonth = base.getUTCMonth();
  const utcDate = base.getUTCDate();
  const expiresAtMs = Date.UTC(utcYear, utcMonth, utcDate, 23, 59, 59, 999) + (Math.max(normalizedDays - 1, 0) * 24 * 60 * 60 * 1000);

  return new Date(expiresAtMs).toISOString();
}

async function getProductShelfLifeDays(db, productId) {
  const result = await db.query(
    `SELECT shelf_life_days
     FROM products
     WHERE id = $1`,
    [productId]
  );

  if (!result.rows.length) {
    const err = new Error(`Product ${productId} not found`);
    err.status = 404;
    err.code = 'PRODUCT_NOT_FOUND';
    throw err;
  }

  return normalizeShelfLifeDays(result.rows[0].shelf_life_days);
}

export async function ensureStockBatchSchema() {
  if (stockBatchSchemaPromise) return stockBatchSchemaPromise;

  stockBatchSchemaPromise = (async () => {
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER');
    await query('ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_source_check');
    await query(`ALTER TABLE inventory ADD CONSTRAINT inventory_source_check CHECK (source IN ('baked', 'purchased', 'manual'))`);
    await query(
      `CREATE TABLE IF NOT EXISTS inventory_stock_batches (
         id BIGSERIAL PRIMARY KEY,
         product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
         location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
         initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
         quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
         source VARCHAR(30) NOT NULL DEFAULT 'manual',
         reference_type VARCHAR(30),
         reference_id BIGINT,
         created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         expires_at TIMESTAMPTZ,
         metadata JSONB NOT NULL DEFAULT '{}'::jsonb
       )`
    );
    await query('CREATE INDEX IF NOT EXISTS idx_inventory_stock_batches_lookup ON inventory_stock_batches(location_id, product_id, expires_at, created_at)');
    await query('CREATE INDEX IF NOT EXISTS idx_inventory_stock_batches_reference ON inventory_stock_batches(reference_type, reference_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_inventory_stock_batches_available ON inventory_stock_batches(location_id, product_id, expires_at, created_at) WHERE quantity_remaining > 0');
    await query('CREATE INDEX IF NOT EXISTS idx_products_shelf_life_days ON products(shelf_life_days)');
  })().catch((error) => {
    stockBatchSchemaPromise = null;
    throw error;
  });

  return stockBatchSchemaPromise;
}

export async function getAvailableBatchQuantity(dbOrQuery, locationId, productId) {
  const db = getDbExecutor(dbOrQuery);
  const result = await db.query(
    `SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity
     FROM inventory_stock_batches
     WHERE location_id = $1
       AND product_id = $2
       AND quantity_remaining > 0`,
    [locationId, productId]
  );

  return normalizeQuantity(result.rows[0]?.quantity);
}

export async function ensureInventoryCoverageBatch(dbOrQuery, locationId, productId, source = 'manual') {
  const db = getDbExecutor(dbOrQuery);
  const inventoryResult = await db.query(
    `SELECT quantity
     FROM inventory
     WHERE location_id = $1 AND product_id = $2`,
    [locationId, productId]
  );

  if (!inventoryResult.rows.length) return null;

  const inventoryQuantity = normalizeQuantity(inventoryResult.rows[0].quantity);
  const availableBatchQuantity = await getAvailableBatchQuantity(db, locationId, productId);
  const missingQuantity = inventoryQuantity - availableBatchQuantity;

  if (missingQuantity <= 0) return null;

  const result = await db.query(
    `INSERT INTO inventory_stock_batches
     (product_id, location_id, initial_quantity, quantity_remaining, source, reference_type, created_at, metadata)
     VALUES ($1, $2, $3, $3, $4, 'legacy_inventory', NOW(), $5)
     RETURNING *`,
    [productId, locationId, missingQuantity, source, JSON.stringify({ auto_created_from_inventory: true })]
  );

  return result.rows[0];
}

export async function syncInventoryFromStockBatches(dbOrQuery, locationId, productId, source = 'manual') {
  const db = getDbExecutor(dbOrQuery);
  const quantity = await getAvailableBatchQuantity(db, locationId, productId);
  const resolvedSourceResult = await db.query(
    `SELECT COALESCE(
        (
          SELECT source
          FROM inventory_stock_batches
          WHERE location_id = $1
            AND product_id = $2
            AND quantity_remaining > 0
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        ),
        (
          SELECT source
          FROM inventory
          WHERE location_id = $1
            AND product_id = $2
          LIMIT 1
        ),
        (
          SELECT source
          FROM products
          WHERE id = $2
          LIMIT 1
        ),
        $3,
        'baked'
      ) AS source`,
    [locationId, productId, source]
  );
  const resolvedSource = resolvedSourceResult.rows[0]?.source || 'baked';

  const result = await db.query(
    `INSERT INTO inventory (product_id, location_id, quantity, source, last_updated)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (product_id, location_id)
     DO UPDATE SET quantity = EXCLUDED.quantity, source = EXCLUDED.source, last_updated = CURRENT_TIMESTAMP
     RETURNING *`,
    [productId, locationId, quantity, resolvedSource]
  );

  return result.rows[0];
}

export async function addStockBatch(dbOrQuery, {
  productId,
  locationId,
  quantity,
  source = 'manual',
  referenceType = null,
  referenceId = null,
  createdBy = null,
  createdAt = null,
  shelfLifeDays = undefined,
  metadata = {},
}) {
  const db = getDbExecutor(dbOrQuery);
  const normalizedQuantity = normalizeQuantity(quantity);
  if (normalizedQuantity <= 0) return null;

  const resolvedShelfLifeDays = shelfLifeDays === undefined
    ? await getProductShelfLifeDays(db, productId)
    : normalizeShelfLifeDays(shelfLifeDays);

  const effectiveCreatedAt = createdAt ? new Date(createdAt) : new Date();
  const createdAtIso = Number.isNaN(effectiveCreatedAt.getTime()) ? new Date().toISOString() : effectiveCreatedAt.toISOString();
  const expiresAt = computeExpiresAt(createdAtIso, resolvedShelfLifeDays);

  const existing = await db.query(
    `SELECT id
     FROM inventory_stock_batches
     WHERE product_id = $1
       AND location_id = $2
       AND source = $3
       AND quantity_remaining >= 0
       AND (
         (expires_at IS NULL AND $4::timestamptz IS NULL)
         OR expires_at = $4::timestamptz
       )
     ORDER BY id DESC
     LIMIT 1`,
    [productId, locationId, source, expiresAt]
  );

  const payload = JSON.stringify(metadata || {});

  let batch;
  if (existing.rows.length) {
    const updated = await db.query(
      `UPDATE inventory_stock_batches
       SET initial_quantity = initial_quantity + $1,
           quantity_remaining = quantity_remaining + $1,
           reference_type = COALESCE($2, reference_type),
           reference_id = COALESCE($3, reference_id),
           created_by = COALESCE($4, created_by),
           metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb
       WHERE id = $6
       RETURNING *`,
      [normalizedQuantity, referenceType, referenceId, createdBy, payload, existing.rows[0].id]
    );
    batch = updated.rows[0];
  } else {
    const inserted = await db.query(
      `INSERT INTO inventory_stock_batches
       (product_id, location_id, initial_quantity, quantity_remaining, source, reference_type, reference_id, created_by, created_at, expires_at, metadata)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [productId, locationId, normalizedQuantity, source, referenceType, referenceId, createdBy, createdAtIso, expiresAt, payload]
    );
    batch = inserted.rows[0];
  }

  await syncInventoryFromStockBatches(db, locationId, productId, source);
  return batch;
}

export async function consumeStockBatches(dbOrQuery, {
  productId,
  locationId,
  quantity,
  createdBy = null,
  referenceType = null,
  referenceId = null,
  metadata = {},
}) {
  const db = getDbExecutor(dbOrQuery);
  const requestedQuantity = normalizeQuantity(quantity);
  if (requestedQuantity <= 0) {
    return { consumed: [], remainingTotalQuantity: await getAvailableBatchQuantity(db, locationId, productId) };
  }

  await ensureInventoryCoverageBatch(db, locationId, productId);

  const availableResult = await db.query(
    `SELECT id, quantity_remaining, expires_at, created_at, source
     FROM inventory_stock_batches
     WHERE location_id = $1
       AND product_id = $2
       AND quantity_remaining > 0
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC
     FOR UPDATE`,
    [locationId, productId]
  );

  const availableQuantity = availableResult.rows.reduce((sum, row) => sum + normalizeQuantity(row.quantity_remaining), 0);
  if (availableQuantity < requestedQuantity) {
    const err = new Error(`Insufficient stock for product ${productId}`);
    err.status = 400;
    err.code = 'INSUFFICIENT_STOCK';
    err.details = {
      product_id: Number(productId),
      requested_quantity: requestedQuantity,
      available_quantity: availableQuantity,
    };
    throw err;
  }

  let remainingToConsume = requestedQuantity;
  const consumed = [];

  for (const row of availableResult.rows) {
    if (remainingToConsume <= 0) break;
    const batchAvailable = normalizeQuantity(row.quantity_remaining);
    if (batchAvailable <= 0) continue;

    const quantityToConsume = Math.min(batchAvailable, remainingToConsume);
    const updateResult = await db.query(
      `UPDATE inventory_stock_batches
       SET quantity_remaining = quantity_remaining - $1,
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $3
       RETURNING id, quantity_remaining, expires_at, source`,
      [quantityToConsume, JSON.stringify({ last_consumed_by: createdBy, reference_type: referenceType, reference_id: referenceId, ...metadata }), row.id]
    );

    consumed.push({
      batchId: Number(row.id),
      quantity: quantityToConsume,
      expiresAt: row.expires_at,
      source: row.source,
      quantityRemaining: normalizeQuantity(updateResult.rows[0]?.quantity_remaining),
    });
    remainingToConsume -= quantityToConsume;
  }

  const inventoryRow = await syncInventoryFromStockBatches(db, locationId, productId);

  return {
    consumed,
    remainingTotalQuantity: normalizeQuantity(inventoryRow.quantity),
  };
}

export async function reduceStockBatches(dbOrQuery, {
  productId,
  locationId,
  quantity,
  newestFirst = true,
  metadata = {},
}) {
  const db = getDbExecutor(dbOrQuery);
  const reduceBy = normalizeQuantity(quantity);
  if (reduceBy <= 0) {
    return { reduced: [], remainingTotalQuantity: await getAvailableBatchQuantity(db, locationId, productId) };
  }

  await ensureInventoryCoverageBatch(db, locationId, productId);

  const orderClause = newestFirst
    ? 'expires_at DESC NULLS FIRST, created_at DESC, id DESC'
    : 'expires_at ASC NULLS LAST, created_at ASC, id ASC';

  const batchResult = await db.query(
    `SELECT id, quantity_remaining, expires_at, created_at, source
     FROM inventory_stock_batches
     WHERE location_id = $1
       AND product_id = $2
       AND quantity_remaining > 0
     ORDER BY ${orderClause}
     FOR UPDATE`,
    [locationId, productId]
  );

  let remaining = reduceBy;
  const reduced = [];

  for (const row of batchResult.rows) {
    if (remaining <= 0) break;
    const batchAvailable = normalizeQuantity(row.quantity_remaining);
    if (batchAvailable <= 0) continue;
    const reduction = Math.min(batchAvailable, remaining);

    const updateResult = await db.query(
      `UPDATE inventory_stock_batches
       SET quantity_remaining = quantity_remaining - $1,
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $3
       RETURNING id, quantity_remaining`,
      [reduction, JSON.stringify(metadata || {}), row.id]
    );

    reduced.push({
      batchId: Number(row.id),
      quantity: reduction,
      expiresAt: row.expires_at,
      source: row.source,
      quantityRemaining: normalizeQuantity(updateResult.rows[0]?.quantity_remaining),
    });
    remaining -= reduction;
  }

  const inventoryRow = await syncInventoryFromStockBatches(db, locationId, productId);

  return {
    reduced,
    remainingTotalQuantity: normalizeQuantity(inventoryRow.quantity),
    unreducedQuantity: remaining,
  };
}

export async function replaceProductStock(dbOrQuery, {
  productId,
  locationId,
  quantity,
  source = 'manual',
  createdBy = null,
  shelfLifeDays = undefined,
  metadata = {},
}) {
  const db = getDbExecutor(dbOrQuery);
  const targetQuantity = normalizeQuantity(quantity);
  await ensureInventoryCoverageBatch(db, locationId, productId, source);
  const currentQuantity = await getAvailableBatchQuantity(db, locationId, productId);

  if (targetQuantity > currentQuantity) {
    await addStockBatch(db, {
      productId,
      locationId,
      quantity: targetQuantity - currentQuantity,
      source,
      referenceType: 'manual_adjustment',
      createdBy,
      shelfLifeDays,
      metadata,
    });
  } else if (targetQuantity < currentQuantity) {
    await reduceStockBatches(db, {
      productId,
      locationId,
      quantity: currentQuantity - targetQuantity,
      newestFirst: true,
      metadata,
    });
  } else {
    await syncInventoryFromStockBatches(db, locationId, productId, source);
  }

  return syncInventoryFromStockBatches(db, locationId, productId, source);
}

export async function clearProductStock(dbOrQuery, { productId, locationId, source = 'manual', metadata = {} }) {
  const db = getDbExecutor(dbOrQuery);
  await db.query(
    `UPDATE inventory_stock_batches
     SET quantity_remaining = 0,
         metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
     WHERE product_id = $2 AND location_id = $3 AND quantity_remaining > 0`,
    [JSON.stringify(metadata || {}), productId, locationId]
  );

  return syncInventoryFromStockBatches(db, locationId, productId, source);
}

export async function getNextExpiryForProduct(dbOrQuery, locationId, productId) {
  const db = getDbExecutor(dbOrQuery);
  const result = await db.query(
    `SELECT MIN(expires_at) FILTER (WHERE quantity_remaining > 0 AND expires_at > NOW()) AS next_expires_at
     FROM inventory_stock_batches
     WHERE location_id = $1 AND product_id = $2`,
    [locationId, productId]
  );

  return result.rows[0]?.next_expires_at || null;
}

export default {
  ensureStockBatchSchema,
  addStockBatch,
  clearProductStock,
  consumeStockBatches,
  ensureInventoryCoverageBatch,
  getAvailableBatchQuantity,
  getNextExpiryForProduct,
  replaceProductStock,
  reduceStockBatches,
  syncInventoryFromStockBatches,
};
