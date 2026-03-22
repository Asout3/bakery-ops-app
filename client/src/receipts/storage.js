const STORAGE_KEY = 'receipt_local_sales_v1';

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveAll(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 250)));
}

function matchesIdentifier(item, identifier) {
  return item.client_transaction_id === identifier || item.receipt_number === identifier;
}

export function saveLocalReceiptRecord(record) {
  const current = loadAll();
  const next = [record, ...current.filter((item) => !matchesIdentifier(item, record.client_transaction_id) && !matchesIdentifier(item, record.receipt_number))];
  saveAll(next);
  return record;
}

export function updateLocalReceiptRecord(identifier, updater) {
  const current = loadAll();
  const next = current.map((item) => matchesIdentifier(item, identifier) ? updater(item) : item);
  saveAll(next);
  return next.find((item) => matchesIdentifier(item, identifier)) || null;
}

export function listLocalReceiptRecords({ locationId = null } = {}) {
  return loadAll()
    .filter((item) => locationId == null || String(item.location_id || '') === String(locationId))
    .sort((a, b) => new Date(b.sale_date || b.created_at || 0) - new Date(a.sale_date || a.created_at || 0));
}

export function getLocalReceiptRecord(identifier) {
  return loadAll().find((item) => matchesIdentifier(item, identifier)) || null;
}
