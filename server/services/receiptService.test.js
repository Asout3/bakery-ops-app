import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptPayload, normalizeReceiptSettings, normalizeReceiptTemplateSchema, summarizePrintEvents } from './receiptService.js';

test('normalize receipt settings keeps strict reprint defaults', () => {
  const settings = normalizeReceiptSettings({ printMode: 'ask', printerProfile: { saleAdapter: 'network', networkEnabled: true, networkHost: '192.168.1.22', networkPort: 9100 }, reprintPolicy: { adminOverrideAfterWindow: true } });
  assert.equal(settings.printMode, 'ask');
  assert.equal(settings.showReceiptAfterSale, true);
  assert.equal(settings.printerProfile.saleAdapter, 'network');
  assert.equal(settings.printerProfile.networkEnabled, true);
  assert.equal(settings.reprintPolicy.windowMinutes, 20);
  assert.equal(settings.reprintPolicy.maxManualReprints, 2);
  assert.equal(settings.reprintPolicy.adminOverrideAfterWindow, true);
});

test('buildReceiptPayload produces thermal-friendly totals and header lines', () => {
  const template = normalizeReceiptTemplateSchema({ sections: { header: { businessName: 'Bakery', branchName: 'Airport', taxPercent: 15 }, footer: { footerText: 'Thanks', website: 'https://bakery.test' } } });
  const payload = buildReceiptPayload({
    sale: { id: 1, receipt_number: 'RC-POS1-20260321-0001', sale_date: '2026-03-21T10:00:00.000Z', payment_method: 'cash', cashier_name: 'hana', total_amount: 125.5, status: 'completed' },
    items: [{ product_id: 1, product_name: 'Bread', quantity: 2, unit_price: 30, subtotal: 60 }, { product_id: 2, product_name: 'Cake', quantity: 1, unit_price: 65.5, subtotal: 65.5 }],
    template,
    settings: normalizeReceiptSettings(),
  });
  assert.equal(payload.header_lines[0], 'Bakery');
  assert.equal(payload.receipt_number, 'RC-POS1-20260321-0001');
  assert.equal(payload.totals.total, 125.5);
  assert.equal(payload.totals.tax, 16.37);
  assert.equal(payload.website, 'https://bakery.test');
  assert.equal(payload.items.length, 2);
});

test('buildReceiptPayload keeps total unchanged when tax visibility is disabled', () => {
  const template = normalizeReceiptTemplateSchema({ sections: { header: { taxPercent: 15 }, totals: { showTax: false } } });
  const payload = buildReceiptPayload({
    sale: { id: 2, receipt_number: 'RC-POS1-20260321-0002', sale_date: '2026-03-21T10:00:00.000Z', payment_method: 'cash', cashier_name: 'hana', total_amount: 100, status: 'completed' },
    items: [{ product_id: 1, product_name: 'Bread', quantity: 2, unit_price: 50, subtotal: 100 }],
    template,
    settings: normalizeReceiptSettings(),
  });
  assert.equal(payload.totals.total, 100);
  assert.equal(payload.totals.subtotal, 100);
  assert.equal(payload.totals.tax, 0);
});

test('summarizePrintEvents enforces remaining manual reprints', () => {
  const settings = normalizeReceiptSettings({ reprintPolicy: { maxManualReprints: 2, windowMinutes: 20 } });
  const sale = { sale_date: new Date(Date.now() - (5 * 60 * 1000)).toISOString(), receipt_number: 'RC-TEST-20260321-0001', receipt_payload: { receipt_number: 'RC-TEST-20260321-0001' }, status: 'completed' };
  const summary = summarizePrintEvents([
    { attempt_type: 'original', status: 'success', initiated_at: new Date().toISOString(), completed_at: new Date().toISOString(), actor_name: 'cashier-1' },
    { attempt_type: 'manual_reprint', status: 'success', initiated_at: new Date().toISOString(), completed_at: new Date().toISOString(), actor_name: 'cashier-1' },
  ], sale, settings);
  assert.equal(summary.printed, true);
  assert.equal(summary.reprint_count, 1);
  assert.equal(summary.reprints_remaining, 1);
  assert.equal(summary.in_reprint_window, true);
});
