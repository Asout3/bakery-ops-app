import api from '../api/axios';
import { enqueueOperation } from '../utils/offlineQueue';
import { createReceiptDocument } from './render';
import { updateLocalReceiptRecord } from './storage';

function openReceiptWindow(documentPayload, title) {
  const popup = window.open('', title || '_blank', 'noopener,noreferrer,width=420,height=720');
  if (!popup) {
    throw new Error('Popup blocked. Allow popups to print receipts.');
  }
  popup.document.open();
  popup.document.write(documentPayload.html);
  popup.document.close();
  return popup;
}

const adapters = {
  async browser({ documentPayload }) {
    const popup = openReceiptWindow(documentPayload, documentPayload.title);
    await new Promise((resolve) => setTimeout(resolve, 150));
    popup.focus();
    popup.print();
    return { status: 'success', adapterMode: 'browser' };
  },
  async preview({ documentPayload }) {
    openReceiptWindow(documentPayload, `${documentPayload.title}-preview`);
    return { status: 'previewed', adapterMode: 'preview' };
  },
  async pdf({ documentPayload }) {
    const popup = openReceiptWindow(documentPayload, `${documentPayload.title}-pdf`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    popup.focus();
    popup.print();
    return { status: 'success', adapterMode: 'pdf' };
  },
  async fake({ settings }) {
    if (settings?.printerProfile?.simulateFailure) {
      throw new Error('Simulated printer failure is enabled.');
    }
    return { status: 'success', adapterMode: 'fake' };
  },
};

async function persistPrintEvent({ sale, attemptType, adapterMode, status, errorMessage, metadata }) {
  const eventId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `print-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const payload = {
    event_id: eventId,
    sale_id: sale.id || null,
    client_transaction_id: sale.client_transaction_id,
    receipt_number: sale.receipt_number,
    attempt_type: attemptType,
    adapter_mode: adapterMode,
    status,
    initiated_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    error_message: errorMessage || null,
    metadata: metadata || {},
  };

  try {
    await api.post('/sales/print-events', payload);
  } catch (error) {
    if (!error.response) {
      await enqueueOperation({ url: '/sales/print-events', method: 'post', data: payload, idempotencyKey: eventId });
    } else {
      throw error;
    }
  }

  updateLocalReceiptRecord(sale.client_transaction_id, (record) => {
    const printSummary = record.print_summary || {};
    const currentAttempts = Number(printSummary.print_attempts || 0);
    const currentReprints = Number(printSummary.reprint_count || 0);
    const nextReprints = attemptType === 'manual_reprint' && status === 'success' ? currentReprints + 1 : currentReprints;
    return {
      ...record,
      print_summary: {
        ...printSummary,
        receipt_generated: true,
        printed: status === 'success' ? true : Boolean(printSummary.printed),
        print_attempts: currentAttempts + 1,
        last_print_result: status,
        last_printed_by: record.cashier_name || printSummary.last_printed_by || '',
        last_print_at: payload.completed_at,
        reprint_count: nextReprints,
        reprints_remaining: Math.max(0, Number(record.settings?.reprintPolicy?.maxManualReprints || 2) - nextReprints),
        in_reprint_window: printSummary.in_reprint_window ?? true,
        print_events: [payload, ...(printSummary.print_events || [])],
      },
    };
  });
}

export async function performReceiptPrint({ sale, template, settings, adapterMode, attemptType = 'original', printLabel = '' }) {
  const adapter = adapters[adapterMode];
  if (!adapter) {
    throw new Error(`Unsupported print adapter: ${adapterMode}`);
  }
  const documentPayload = createReceiptDocument({ sale, template, settings, options: { isReprint: attemptType === 'manual_reprint', printLabel } });
  try {
    const result = await adapter({ documentPayload, sale, settings, template });
    await persistPrintEvent({ sale, attemptType, adapterMode: result.adapterMode, status: result.status, metadata: { paper_width: template.paperWidth, print_label: printLabel || null } });
    return result;
  } catch (error) {
    await persistPrintEvent({ sale, attemptType, adapterMode, status: 'failed', errorMessage: error.message, metadata: { paper_width: template.paperWidth } });
    throw error;
  }
}

export async function markReceiptPrintCancelled({ sale, attemptType = 'original', adapterMode = 'browser' }) {
  await persistPrintEvent({ sale, attemptType, adapterMode, status: 'cancelled', metadata: { reason: 'cashier_cancelled' } });
}
