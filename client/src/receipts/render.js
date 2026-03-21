import { formatMoney, normalizeReceiptSettings, normalizeReceiptTemplate } from './helpers';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderSeparator(style) {
  if (style === 'dotted') return '. '.repeat(24);
  return '-'.repeat(32);
}

function renderLine(label, value, bold = false) {
  return `<div class="receipt-line ${bold ? 'receipt-line-bold' : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

export function createReceiptDocument({ sale, template, settings, options = {} }) {
  const normalizedTemplate = normalizeReceiptTemplate(template || {});
  const normalizedSettings = normalizeReceiptSettings(settings || {});
  const payload = sale.receipt_payload || {};
  const headerLines = payload.header_lines || [];
  const decimals = Number(payload.decimals ?? normalizedTemplate.sections.transaction.decimals ?? 2);
  const currencyCode = payload.currency_code || normalizedTemplate.sections.transaction.currencyCode || 'ETB';
  const totals = payload.totals || {};
  const items = payload.items || sale.items || [];
  const printLabel = options.printLabel || (options.isReprint ? normalizedSettings.labels.reprint : '');
  const voidLabel = sale.status === 'voided' ? normalizedSettings.labels.voided : '';

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(payload.receipt_number || sale.receipt_number || 'Receipt')}</title>
    <style>
      :root { --receipt-width: ${normalizedTemplate.paperWidth === '58mm' ? '220px' : '302px'}; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 12px; background: #f5f5f5; font-family: 'Courier New', monospace; color: #111; }
      .receipt-shell { display: flex; justify-content: center; }
      .receipt { width: var(--receipt-width); background: #fff; padding: 12px 10px 18px; border: 1px solid #ddd; }
      .receipt-center { text-align: center; }
      .receipt-header-title { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
      .receipt-meta, .receipt-footer { font-size: 12px; line-height: 1.35; }
      .receipt-section { margin-top: 10px; }
      .receipt-separator { white-space: pre; overflow: hidden; font-size: 12px; line-height: 1; margin: 8px 0; }
      .receipt-line { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; line-height: 1.35; }
      .receipt-line span:last-child { text-align: right; }
      .receipt-line-bold { font-weight: 700; }
      .receipt-items-header, .receipt-item-row { display: grid; grid-template-columns: 1fr 42px 78px; gap: 8px; font-size: 12px; }
      .receipt-items-header { font-weight: 700; margin-bottom: 6px; }
      .receipt-item-row { margin-bottom: 5px; }
      .receipt-item-name { white-space: pre-wrap; word-break: break-word; }
      .receipt-item-qty, .receipt-item-value { text-align: right; }
      .receipt-badge { border: 1px solid #111; display: inline-block; padding: 2px 8px; margin-bottom: 8px; font-size: 12px; font-weight: 700; }
      .receipt-total-box { border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 6px 0; margin-top: 6px; }
      .receipt-footer { margin-top: 10px; }
      @media print {
        body { background: #fff; padding: 0; }
        .receipt { border: none; width: 100%; padding: 0; }
      }
    </style>
  </head>
  <body>
    <div class="receipt-shell">
      <article class="receipt">
        <div class="receipt-center">
          ${printLabel ? `<div class="receipt-badge">${escapeHtml(printLabel)}</div>` : ''}
          ${voidLabel ? `<div class="receipt-badge">${escapeHtml(voidLabel)}</div>` : ''}
          <div class="receipt-header-title">${escapeHtml(headerLines[0] || normalizedTemplate.sections.header.businessName)}</div>
          <div class="receipt-meta">${headerLines.slice(1).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>
        </div>
        <div class="receipt-section receipt-meta">
          ${normalizedTemplate.sections.transaction.showReceiptNumber ? renderLine('Receipt', payload.receipt_number || sale.receipt_number || '') : ''}
          ${normalizedTemplate.sections.transaction.showDateTime ? renderLine('Date', new Date(payload.sale_date || sale.sale_date || Date.now()).toLocaleString()) : ''}
          ${normalizedTemplate.sections.transaction.showCashier ? renderLine(normalizedTemplate.sections.header.cashierLabel || 'Cashier', payload.cashier_name || sale.cashier_name || '') : ''}
          ${normalizedTemplate.sections.transaction.showPaymentMethod ? renderLine('Payment', payload.payment_method || sale.payment_method || '') : ''}
        </div>
        <div class="receipt-separator">${escapeHtml(renderSeparator(normalizedTemplate.separatorStyle))}</div>
        <div class="receipt-section">
          <div class="receipt-items-header">
            <div>ITEM</div>
            <div class="receipt-item-qty">${escapeHtml(normalizedTemplate.sections.items.quantityLabel || 'QTY')}</div>
            <div class="receipt-item-value">${escapeHtml(normalizedTemplate.sections.items.totalLabel || 'TOTAL')}</div>
          </div>
          ${items.map((item) => `<div class="receipt-item-row"><div class="receipt-item-name">${escapeHtml(item.product_name || '')}${item.notes ? `<div>${escapeHtml(item.notes)}</div>` : ''}</div><div class="receipt-item-qty">${escapeHtml(item.quantity)}</div><div class="receipt-item-value">${escapeHtml(formatMoney(item.subtotal, currencyCode, decimals))}</div></div>${normalizedTemplate.sections.items.showUnitPrice ? `<div class="receipt-line"><span></span><span>${escapeHtml(formatMoney(item.unit_price, currencyCode, decimals))} ea</span></div>` : ''}`).join('')}
        </div>
        <div class="receipt-separator">${escapeHtml(renderSeparator(normalizedTemplate.separatorStyle))}</div>
        <div class="receipt-section receipt-meta">
          ${normalizedTemplate.sections.totals.showSubtotal ? renderLine('Subtotal', formatMoney(totals.subtotal, currencyCode, decimals)) : ''}
          ${normalizedTemplate.sections.totals.showDiscounts && Number(totals.discounts || 0) > 0 ? renderLine('Discounts', formatMoney(totals.discounts, currencyCode, decimals)) : ''}
          ${normalizedTemplate.sections.totals.showTax && Number(totals.tax || 0) > 0 ? renderLine('Tax', formatMoney(totals.tax, currencyCode, decimals)) : ''}
          ${normalizedTemplate.sections.totals.showServiceCharge && Number(totals.serviceCharge || 0) > 0 ? renderLine('Service', formatMoney(totals.serviceCharge, currencyCode, decimals)) : ''}
          <div class="receipt-total-box">${renderLine(normalizedTemplate.sections.totals.totalLabel || 'TOTAL', formatMoney(totals.total, currencyCode, decimals), true)}</div>
          ${normalizedTemplate.sections.totals.showPaidAmount ? renderLine(normalizedTemplate.sections.totals.paidLabel || 'PAID', formatMoney(totals.paidAmount ?? totals.total, currencyCode, decimals)) : ''}
          ${normalizedTemplate.sections.totals.showChange && Number(totals.change || 0) >= 0 ? renderLine(normalizedTemplate.sections.totals.changeLabel || 'CHANGE', formatMoney(totals.change || 0, currencyCode, decimals)) : ''}
        </div>
        <div class="receipt-footer receipt-center">
          ${payload.footer_text ? `<div>${escapeHtml(payload.footer_text)}</div>` : ''}
          ${payload.legal_text ? `<div>${escapeHtml(payload.legal_text)}</div>` : ''}
          ${payload.qr_value ? `<div>${escapeHtml(payload.qr_value)}</div>` : ''}
        </div>
      </article>
    </div>
  </body>
</html>`;

  return {
    html,
    paperWidth: normalizedTemplate.paperWidth,
    title: payload.receipt_number || sale.receipt_number || 'Receipt',
  };
}
