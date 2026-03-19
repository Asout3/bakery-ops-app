import { query } from '../db.js';
import { createLowStockNotificationIfNeeded } from './stockAlertService.js';
import { ensureStockBatchSchema, syncInventoryFromStockBatches } from './stockBatchService.js';

let wasteSchemaPromise = null;

function getDbExecutor(dbOrQuery) {
  if (typeof dbOrQuery === 'function') {
    return { query: dbOrQuery };
  }
  return dbOrQuery;
}

export async function ensureWasteSchema() {
  if (wasteSchemaPromise) {
    return wasteSchemaPromise;
  }

  wasteSchemaPromise = (async () => {
    await ensureStockBatchSchema();
    await query(
      `CREATE TABLE IF NOT EXISTS waste_records (
         id SERIAL PRIMARY KEY,
         product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
         location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
         quantity_wasted INTEGER NOT NULL CHECK (quantity_wasted > 0),
         cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
         total_loss NUMERIC(12,2) NOT NULL DEFAULT 0,
         reason VARCHAR(30) NOT NULL DEFAULT 'expired',
         wasted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
         metadata JSONB NOT NULL DEFAULT '{}'::jsonb
       )`
    );
    await query('CREATE INDEX IF NOT EXISTS idx_waste_records_location_time ON waste_records(location_id, wasted_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_waste_records_product_time ON waste_records(product_id, wasted_at DESC)');
  })().catch((error) => {
    wasteSchemaPromise = null;
    throw error;
  });

  return wasteSchemaPromise;
}

export async function processExpiredInventoryForLocation(dbOrQuery, locationId, actorUserId = null) {
  if (!locationId) {
    return { processedCount: 0, totalLoss: 0, items: [] };
  }

  const db = getDbExecutor(dbOrQuery);
  const expiredResult = await db.query(
    `SELECT sb.id AS stock_batch_id,
            sb.location_id,
            sb.product_id,
            sb.quantity_remaining AS quantity,
            sb.expires_at,
            COALESCE(p.group_name, p.name) AS group_name,
            p.name AS product_name,
            p.cost,
            p.unit
     FROM inventory_stock_batches sb
     JOIN products p ON p.id = sb.product_id
     WHERE sb.location_id = $1
       AND sb.quantity_remaining > 0
       AND sb.expires_at IS NOT NULL
       AND sb.expires_at <= NOW()
     ORDER BY sb.expires_at ASC, sb.id ASC`,
    [locationId]
  );

  if (!expiredResult.rows.length) {
    return { processedCount: 0, totalLoss: 0, items: [] };
  }

  const processedItems = [];
  let totalLoss = 0;

  for (const row of expiredResult.rows) {
    const quantity = Number(row.quantity || 0);
    if (quantity <= 0) continue;

    const costPerUnit = Number(row.cost || 0);
    const loss = Number((quantity * costPerUnit).toFixed(2));
    const metadata = {
      reason: 'expired',
      stock_batch_id: row.stock_batch_id,
      expires_at: row.expires_at,
      quantity_before_waste: quantity,
      product_name: row.product_name,
      group_name: row.group_name,
    };

    const wasteResult = await db.query(
      `INSERT INTO waste_records
       (product_id, location_id, quantity_wasted, cost_per_unit, total_loss, reason, created_by, metadata)
       VALUES ($1, $2, $3, $4, $5, 'expired', $6, $7)
       RETURNING *`,
      [row.product_id, row.location_id, quantity, costPerUnit, loss, actorUserId, JSON.stringify(metadata)]
    );

    await db.query(
      `UPDATE inventory_stock_batches
       SET quantity_remaining = 0,
           metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
       WHERE id = $2`,
      [JSON.stringify({ waste_record_id: wasteResult.rows[0].id, expired_processed_at: new Date().toISOString() }), row.stock_batch_id]
    );

    await syncInventoryFromStockBatches(db, row.location_id, row.product_id);

    await db.query(
      `INSERT INTO inventory_movements
       (location_id, product_id, movement_type, quantity_change, source, reference_type, reference_id, created_by, metadata)
       VALUES ($1, $2, 'manual_adjustment', $3, 'manual', 'waste', $4, $5, $6)`,
      [row.location_id, row.product_id, -quantity, wasteResult.rows[0].id, actorUserId, JSON.stringify({ ...metadata, waste_record_id: wasteResult.rows[0].id, total_loss: loss })]
    );

    await db.query(
      `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
       SELECT id, $1, $2, $3, 'waste'
       FROM users
       WHERE role IN ('admin', 'manager')
         AND location_id = $1
         AND is_active = true`,
      [
        row.location_id,
        'Expired stock moved to waste',
        `${row.group_name} / ${row.product_name} expired on ${new Date(row.expires_at).toLocaleDateString()} and ${quantity} unit(s) were moved to waste. Loss: ETB ${loss.toFixed(2)}.`,
      ]
    );

    await db.query(
      `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
       VALUES ($1, $2, 'inventory_wasted', $3, $4)`,
      [actorUserId, row.location_id, `Expired stock moved to waste for product ${row.product_id}`, JSON.stringify({ ...metadata, waste_record_id: wasteResult.rows[0].id, total_loss: loss })]
    );

    await createLowStockNotificationIfNeeded(db, row.location_id, row.product_id);

    totalLoss += loss;
    processedItems.push(wasteResult.rows[0]);
  }

  return {
    processedCount: processedItems.length,
    totalLoss: Number(totalLoss.toFixed(2)),
    items: processedItems,
  };
}

export async function processExpiredInventoryForAllLocations(dbOrQuery, actorUserId = null) {
  const db = getDbExecutor(dbOrQuery);
  const locationsResult = await db.query(
    `SELECT DISTINCT location_id
     FROM inventory_stock_batches
     WHERE quantity_remaining > 0
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()`
  );

  const summaries = [];
  for (const row of locationsResult.rows) {
    summaries.push(await processExpiredInventoryForLocation(db, Number(row.location_id), actorUserId));
  }
  return summaries;
}

export default {
  ensureWasteSchema,
  processExpiredInventoryForLocation,
  processExpiredInventoryForAllLocations,
};
