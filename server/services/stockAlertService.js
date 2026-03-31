const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const LOW_STOCK_COOLDOWN_HOURS = 6;

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

  if (snapshot.quantity > snapshot.threshold) {
    return { triggered: false, reason: 'above_threshold', snapshot };
  }

  const outOfStock = snapshot.quantity <= 0;
  const notificationType = outOfStock ? 'out_of_stock' : 'low_stock';
  const title = outOfStock ? 'Out of Stock Alert' : 'Low Stock Alert';
  const message = outOfStock
    ? `${snapshot.groupName} / ${snapshot.name} is out of stock (0 remaining, threshold ${snapshot.threshold}).`
    : `${snapshot.groupName} / ${snapshot.name} is running low (${snapshot.quantity} remaining, threshold ${snapshot.threshold}).`;

  const recentResult = await db.query(
    `SELECT id
     FROM notifications
     WHERE location_id = $1
       AND notification_type = $5
       AND title = $2
       AND message LIKE $3
       AND created_at >= NOW() - ($4::text || ' hours')::interval
     LIMIT 1`,
    [locationId, title, `${snapshot.groupName} / ${snapshot.name}%`, String(LOW_STOCK_COOLDOWN_HOURS), notificationType]
  );

  if (recentResult.rows.length > 0) {
    return { triggered: false, reason: 'recent_duplicate', snapshot };
  }

  await db.query(
    `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
     SELECT id, $1, $2, $3, $4
     FROM users
     WHERE role IN ('admin', 'manager')
       AND location_id = $1
       AND is_active = true`,
    [locationId, title, message, notificationType]
  );

  return { triggered: true, snapshot, title, message };
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
