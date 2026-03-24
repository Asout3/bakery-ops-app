import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptDocument } from '../../client/src/receipts/render.js';
import { buildPreOrderReceipt } from '../../client/src/receipts/orderReceipt.js';
import { resolveReceiptItemLayoutMetrics } from '../../client/src/receipts/helpers.js';

test('resolveReceiptItemLayoutMetrics keeps receipt item columns within printable bounds', () => {
  const compactMetrics = resolveReceiptItemLayoutMetrics({ columnGap: 24, quantityColumnWidth: 72, totalColumnWidth: 140 }, '58mm');
  assert.deepEqual(compactMetrics, {
    quantityWidth: 52,
    totalWidth: 92,
    columnGap: 12,
    itemGap: 8,
    valuesWidth: 156,
  });

  const standardMetrics = resolveReceiptItemLayoutMetrics({ columnGap: 24, quantityColumnWidth: 72, totalColumnWidth: 140 }, '80mm');
  assert.deepEqual(standardMetrics, {
    quantityWidth: 64,
    totalWidth: 112,
    columnGap: 18,
    itemGap: 10,
    valuesWidth: 194,
  });
});

test('createReceiptDocument applies qty and total spacing only inside the item value block', () => {
  const sale = {
    receipt_number: 'RC-POS-0001',
    sale_date: '2026-03-22T10:00:00.000Z',
    cashier_name: 'Mimi',
    payment_method: 'cash',
    receipt_payload: {
      receipt_number: 'RC-POS-0001',
      sale_date: '2026-03-22T10:00:00.000Z',
      cashier_name: 'Mimi',
      payment_method: 'cash',
      items: [{ product_name: 'Milk Bread', quantity: 2, unit_price: 20, subtotal: 40 }],
      totals: { subtotal: 40, tax: 6, total: 46, paidAmount: 46, change: 0 },
      header_lines: ['Bakery'],
      website: 'https://bakery.test',
    },
  };

  const documentPayload = createReceiptDocument({
    sale,
    template: {
      paperWidth: '80mm',
      sections: {
        header: { taxPercent: 15 },
        items: {
          columnGap: 24,
          quantityColumnWidth: 72,
          totalColumnWidth: 140,
        },
      },
    },
    settings: {},
  });

  assert.match(documentPayload.html, /--receipt-column-gap: 18px;/);
  assert.match(documentPayload.html, /--receipt-values-width: 194px;/);
  assert.match(documentPayload.html, /\.receipt-line \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto; gap: 10px;/);
  assert.match(documentPayload.html, /class="receipt-item-values"/);
  assert.match(documentPayload.html, /receipt-separator-solid/);
  assert.match(documentPayload.html, /Tax \(15%\)/);
  assert.match(documentPayload.html, /https:\/\/bakery\.test/);
  assert.doesNotMatch(documentPayload.html, /CHANGE/);
  assert.doesNotMatch(documentPayload.html, />PAID</);
});

test('buildPreOrderReceipt keeps pickup and balance details for pre-order printing', () => {
  const receipt = buildPreOrderReceipt({
    id: 12,
    order_code: 'PO-0012',
    created_at: '2026-03-22T10:00:00.000Z',
    pickup_at: '2026-03-23T09:30:00.000Z',
    payment_method: 'telebirr',
    customer_name: 'Abel',
    customer_phone: '0911223344',
    customer_note: 'Add candles',
    total_amount: 150,
    paid_amount: 50,
    items: [{ product_id: 4, product_name: 'Birthday Cake', quantity: 1, unit_price: 150 }],
  }, {});

  assert.equal(receipt.receipt_number, 'PO-0012');
  assert.equal(receipt.receipt_payload.totals.total, 150);
  assert.equal(receipt.receipt_payload.totals.paidAmount, 50);
  assert.equal(receipt.receipt_payload.totals.balanceDue, 100);
  assert.match(receipt.receipt_payload.notes, /Pickup:/);
  assert.match(receipt.receipt_payload.notes, /Add candles/);
});
