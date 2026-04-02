import { insertNotificationsForRecipients } from './notificationDispatchService.js';

const DEFAULT_LOW_STOCK_THRESHOLD = 5;
let stockAlertStateSchemaPromise = null;

async function ensureStockAlertStateSchema(db) {
  if (stockAlertStateSchemaPromise) return stockAlertStateSchemaPromise;
  stockAlertStateSchemaPromise = (async () => {
    await db.query(
      `CREATE TABLE IF NOT EXISTS stock_alert_states (
         location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
         product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
         last_state VARCHAR(20) NOT NULL DEFAULT 'normal',
         last_notification_type VARCHAR(30),
         last_notified_at TIMESTAMPTZ,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (location_id, product_id)
       )`
    );
  })().catch((error) => {
    stockAlertStateSchemaPromise = null;
    throw error;
  });
  return stockAlertStateSchemaPromise;
}

function normalizeQuantity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getLowStockSnapshot(db, locationId, productId) {
  const result = await db.query(
    `SELECT p.id AS product_id,
            p.name,
            COALESCE(NULLIF(p.group_name, ''), p.name) AS group_name,
            i.quantity,
            COALESCE(
              p.low_stock_threshold,
              (
                SELECT threshold
                FROM alert_rules ar
                WHERE ar.location_id = $1
                  AND ar.event_type = 'low_stock'
                  AND ar.enabled = true
                ORDER BY ar.updated_at DESC
                LIMIT 1
              ),
              $3
            ) AS threshold
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     WHERE i.location_id = $1 AND i.product_id = $2
     LIMIT 1`,
    [locationId, productId, DEFAULT_LOW_STOCK_THRESHOLD]
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];
  return {
    productId: Number(row.product_id),
    name: row.name,
    groupName: row.group_name,
    quantity: normalizeQuantity(row.quantity),
    threshold: Math.max(0, normalizeQuantity(row.threshold)),
  };
}

export async function createLowStockNotificationIfNeeded(db, locationId, productId) {
  const snapshot = await getLowStockSnapshot(db, locationId, productId);
  if (!snapshot) {
    return { triggered: false, reason: 'missing_inventory' };
  }

  await ensureStockAlertStateSchema(db);

  const nextState = snapshot.quantity <= 0 ? 'out_of_stock' : (snapshot.quantity <= snapshot.threshold ? 'low_stock' : 'normal');
  const stateResult = await db.query(
    `SELECT last_state
     FROM stock_alert_states
     WHERE location_id = $1 AND product_id = $2
     LIMIT 1`,
    [locationId, snapshot.productId]
  );
  const previousState = String(stateResult.rows[0]?.last_state || 'normal');

  if (nextState === 'normal') {
    await db.query(
      `INSERT INTO stock_alert_states (location_id, product_id, last_state, updated_at)
       VALUES ($1, $2, 'normal', NOW())
       ON CONFLICT (location_id, product_id)
       DO UPDATE SET last_state = EXCLUDED.last_state, updated_at = NOW()`,
      [locationId, snapshot.productId]
    );
    return { triggered: false, reason: 'above_threshold', snapshot, previousState, nextState };
  }

  if (previousState === nextState) {
    return { triggered: false, reason: 'unchanged_state', snapshot, previousState, nextState };
  }

  const outOfStock = nextState === 'out_of_stock';
  const notificationType = nextState;
  const title = outOfStock ? 'Out of Stock Alert' : 'Low Stock Alert';
  const message = outOfStock
    ? `${snapshot.groupName} / ${snapshot.name} is out of stock (0 remaining, threshold ${snapshot.threshold}).`
    : `${snapshot.groupName} / ${snapshot.name} is running low (${snapshot.quantity} remaining, threshold ${snapshot.threshold}).`;

  await insertNotificationsForRecipients(db, {
    locationId,
    title,
    message,
    notificationType,
    includeAdmins: true,
    includeManagers: true,
  });

  await db.query(
    `INSERT INTO stock_alert_states (location_id, product_id, last_state, last_notification_type, last_notified_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (location_id, product_id)
     DO UPDATE
     SET last_state = EXCLUDED.last_state,
         last_notification_type = EXCLUDED.last_notification_type,
         last_notified_at = EXCLUDED.last_notified_at,
         updated_at = NOW()`,
    [locationId, snapshot.productId, nextState, notificationType]
  );

  return { triggered: true, snapshot, title, message, previousState, nextState };
}

export async function createLowStockNotificationsForProducts(db, locationId, productIds) {
  const uniqueIds = [...new Set((productIds || []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
  const results = [];

  for (const productId of uniqueIds) {
    results.push(await createLowStockNotificationIfNeeded(db, locationId, productId));
  }

  return results;
}

export default {
  getLowStockSnapshot,
  createLowStockNotificationIfNeeded,
  createLowStockNotificationsForProducts,
};
