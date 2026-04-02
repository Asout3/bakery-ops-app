export const MANAGER_NOTIFICATION_TYPES = [
  'batch',
  'batch_updated',
  'low_stock',
  'out_of_stock',
  'order_created',
  'order_updated',
  'order_deleted',
];

export const CASHIER_NOTIFICATION_TYPES = [
  'low_stock',
  'out_of_stock',
  'order_created',
  'order_updated',
  'order_deleted',
];

function roleShouldReceiveType(role, notificationType) {
  const normalizedType = String(notificationType || '');
  if (role === 'admin') return true;
  if (role === 'manager') return MANAGER_NOTIFICATION_TYPES.includes(normalizedType);
  if (role === 'cashier') return CASHIER_NOTIFICATION_TYPES.includes(normalizedType);
  return false;
}

export async function insertNotificationsForRecipients(db, {
  locationId = null,
  title,
  message,
  notificationType,
  includeAdmins = true,
  includeManagers = false,
  includeCashiers = false,
}) {
  const normalizedType = String(notificationType || '');
  const recipientClauses = [];

  if (includeAdmins && roleShouldReceiveType('admin', normalizedType)) {
    recipientClauses.push(`role = 'admin'`);
  }

  if (includeManagers && roleShouldReceiveType('manager', normalizedType)) {
    recipientClauses.push(`role = 'manager'`);
  }

  if (includeCashiers && roleShouldReceiveType('cashier', normalizedType)) {
    recipientClauses.push(`role = 'cashier'`);
  }

  if (!recipientClauses.length) {
    return;
  }

  await db.query(
    `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
     SELECT id, $1::integer, $2, $3, $4
     FROM users
     WHERE is_active = true
       AND (${recipientClauses.join(' OR ')})`,
    [locationId, title, message, normalizedType]
  );
}
