export const MANAGER_VISIBLE_NOTIFICATION_TYPES = [
  'batch',
  'low_stock',
  'out_of_stock',
  'order_created',
  'order_updated',
  'order_deleted',
  'product_created',
  'product_updated',
];

function shouldIncludeManagers(notificationType, includeManagers) {
  if (!includeManagers) return false;
  return MANAGER_VISIBLE_NOTIFICATION_TYPES.includes(String(notificationType || ''));
}

function buildScopedRoleClause(role) {
  return `(role = '${role}' AND ($1 IS NULL OR location_id = $1 OR location_id IS NULL))`;
}

export async function insertNotificationsForRecipients(db, {
  locationId,
  title,
  message,
  notificationType,
  includeAdmins = true,
  includeManagers = false,
  includeCashiers = false,
}) {
  const normalizedType = String(notificationType || '');
  const includeManagersForType = shouldIncludeManagers(normalizedType, includeManagers);
  const recipientClauses = [];

  if (includeAdmins) {
    recipientClauses.push(`role = 'admin'`);
  }

  if (includeManagersForType) {
    recipientClauses.push(buildScopedRoleClause('manager'));
  }

  if (includeCashiers) {
    recipientClauses.push(buildScopedRoleClause('cashier'));
  }

  if (!recipientClauses.length) {
    return;
  }

  await db.query(
    `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
     SELECT id, $1, $2, $3, $4
     FROM users
     WHERE is_active = true
       AND (${recipientClauses.join(' OR ')})`,
    [locationId, title, message, normalizedType]
  );
}
