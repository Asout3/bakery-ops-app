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

export function saveLocalReceiptRecord(record) {
  const current = loadAll();
  const next = [record, ...current.filter((item) => item.client_transaction_id !== record.client_transaction_id && item.receipt_number !== record.receipt_number)];
  saveAll(next);
  return record;
}

export function updateLocalReceiptRecord(clientTransactionId, updater) {
  const current = loadAll();
  const next = current.map((item) => item.client_transaction_id === clientTransactionId ? updater(item) : item);
  saveAll(next);
  return next.find((item) => item.client_transaction_id === clientTransactionId) || null;
}

export function listLocalReceiptRecords() {
  return loadAll().sort((a, b) => new Date(b.sale_date || b.created_at || 0) - new Date(a.sale_date || a.created_at || 0));
}

export function getLocalReceiptRecord(identifier) {
  return loadAll().find((item) => item.client_transaction_id === identifier || item.receipt_number === identifier) || null;
}
