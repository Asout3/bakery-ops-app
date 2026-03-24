import { formatMoney, normalizeReceiptSettings, normalizeReceiptTemplate, resolveReceiptItemLayoutMetrics } from './helpers.js';

const FONT_FAMILY_MAP = {
  courier: "'Courier New', monospace",
  sans: 'Inter, Arial, sans-serif',
  serif: "Georgia, 'Times New Roman', serif",
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  const typography = normalizedTemplate.typography || {};
  const itemLayout = normalizedTemplate.sections.items || {};
  const transaction = normalizedTemplate.sections.transaction || {};
  const totalSection = normalizedTemplate.sections.totals || {};
  const customerLabel = payload.customer_phone ? `${payload.customer_name || 'Customer'} · ${payload.customer_phone}` : (payload.customer_name || '');
  const itemMetrics = resolveReceiptItemLayoutMetrics(itemLayout, normalizedTemplate.paperWidth);

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(payload.receipt_number || sale.receipt_number || 'Receipt')}</title>
    <style>
      :root {
        --receipt-width: ${normalizedTemplate.paperWidth === '58mm' ? '220px' : '302px'};
        --receipt-font-family: ${FONT_FAMILY_MAP[typography.fontFamily] || FONT_FAMILY_MAP.courier};
        --receipt-base-font-size: ${Number(typography.baseFontSize || 12)}px;
        --receipt-business-font-size: ${Number(typography.businessNameFontSize || 19)}px;
        --receipt-meta-font-size: ${Number(typography.metaFontSize || typography.baseFontSize || 12)}px;
        --receipt-line-height: ${Number(typography.lineHeight || 1.35)};
        --receipt-item-gap: ${itemMetrics.itemGap}px;
        --receipt-column-gap: ${itemMetrics.columnGap}px;
        --receipt-qty-width: ${itemMetrics.quantityWidth}px;
        --receipt-total-width: ${itemMetrics.totalWidth}px;
        --receipt-values-width: ${itemMetrics.valuesWidth}px;
        --receipt-header-align: ${typography.headerAlignment || 'center'};
        --receipt-body-align: ${typography.bodyAlignment || 'left'};
        --receipt-footer-align: ${typography.footerAlignment || 'center'};
      }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 12px; background: #f5f5f5; font-family: var(--receipt-font-family); color: #111; }
      .receipt-shell { display: flex; justify-content: center; }
      .receipt { width: var(--receipt-width); background: #fff; padding: 12px 10px 18px; border: 1px solid #ddd; font-size: var(--receipt-base-font-size); line-height: var(--receipt-line-height); }
      .receipt-center { text-align: var(--receipt-header-align); }
      .receipt-header-title { font-size: var(--receipt-business-font-size); font-weight: 700; margin-bottom: 4px; }
      .receipt-meta, .receipt-footer { font-size: var(--receipt-meta-font-size); line-height: var(--receipt-line-height); text-align: var(--receipt-body-align); }
      .receipt-footer { text-align: var(--receipt-footer-align); }
      .receipt-section { margin-top: 10px; }
      .receipt-separator { width: 100%; margin: 8px 0; border-top: 1px solid #111; }
      .receipt-separator-dotted { border-top-style: dotted; }
      .receipt-separator-solid { border-top-style: solid; }
      .receipt-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; font-size: var(--receipt-meta-font-size); line-height: var(--receipt-line-height); }
      .receipt-line span:last-child { text-align: right; }
      .receipt-line-bold { font-weight: 700; }
      .receipt-items-header, .receipt-item-row { display: grid; grid-template-columns: minmax(0, 1fr) var(--receipt-values-width); gap: var(--receipt-item-gap); align-items: start; font-size: var(--receipt-meta-font-size); }
      .receipt-item-values { display: grid; grid-template-columns: minmax(var(--receipt-qty-width), auto) minmax(var(--receipt-total-width), auto); gap: var(--receipt-column-gap); align-items: start; }
      .receipt-items-header { font-weight: 700; margin-bottom: 6px; }
      .receipt-item-row { margin-bottom: 5px; }
      .receipt-item-name { white-space: pre-wrap; word-break: break-word; }
      .receipt-item-qty, .receipt-item-value { text-align: right; }
      .receipt-item-price { width: var(--receipt-values-width); margin-left: auto; text-align: right; font-size: var(--receipt-meta-font-size); }
      .receipt-note { margin-top: 4px; white-space: pre-wrap; }
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
          <div class="receipt-meta" style="text-align: var(--receipt-header-align);">${headerLines.slice(1).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>
        </div>
        <div class="receipt-section receipt-meta">
          ${transaction.showReceiptNumber ? renderLine('Receipt', payload.receipt_number || sale.receipt_number || '') : ''}
          ${transaction.showDateTime ? renderLine('Date', new Date(payload.sale_date || sale.sale_date || Date.now()).toLocaleString()) : ''}
          ${transaction.showCashier ? renderLine(normalizedTemplate.sections.header.cashierLabel || 'Cashier', payload.cashier_name || sale.cashier_name || '') : ''}
          ${transaction.showPaymentMethod ? renderLine('Payment', payload.payment_method || sale.payment_method || '') : ''}
          ${transaction.showCustomerInfo && customerLabel ? renderLine('Customer', customerLabel) : ''}
          ${transaction.showInternalRef && payload.internal_ref ? renderLine('Reference', payload.internal_ref) : ''}
          ${transaction.showNotes && payload.notes ? `<div class="receipt-note">${escapeHtml(payload.notes)}</div>` : ''}
        </div>
        <div class="receipt-separator receipt-separator-${normalizedTemplate.separatorStyle === 'dotted' ? 'dotted' : 'solid'}"></div>
        <div class="receipt-section">
          <div class="receipt-items-header">
            <div>ITEM</div>
            <div class="receipt-item-values">
              <div class="receipt-item-qty">${escapeHtml(itemLayout.quantityLabel || 'QTY')}</div>
              <div class="receipt-item-value">${escapeHtml(itemLayout.totalLabel || 'TOTAL')}</div>
            </div>
          </div>
          ${items.map((item) => `<div class="receipt-item-row"><div class="receipt-item-name">${escapeHtml(item.product_name || '')}${item.notes ? `<div>${escapeHtml(item.notes)}</div>` : ''}</div><div class="receipt-item-values"><div class="receipt-item-qty">${escapeHtml(item.quantity)}</div><div class="receipt-item-value">${escapeHtml(formatMoney(item.subtotal, currencyCode, decimals))}</div></div></div>${itemLayout.showUnitPrice ? `<div class="receipt-item-price">${escapeHtml(formatMoney(item.unit_price, currencyCode, decimals))} ea</div>` : ''}`).join('')}
        </div>
        <div class="receipt-separator receipt-separator-${normalizedTemplate.separatorStyle === 'dotted' ? 'dotted' : 'solid'}"></div>
        <div class="receipt-section receipt-meta">
          ${totalSection.showSubtotal ? renderLine('Subtotal', formatMoney(totals.subtotal, currencyCode, decimals)) : ''}
          ${totalSection.showDiscounts && Number(totals.discounts || 0) > 0 ? renderLine('Discounts', formatMoney(totals.discounts, currencyCode, decimals)) : ''}
          ${totalSection.showTax && Number(totals.tax || 0) > 0 ? renderLine(`Tax (${Number(normalizedTemplate.sections.header.taxPercent || 0)}%)`, formatMoney(totals.tax, currencyCode, decimals)) : ''}
          ${totalSection.showServiceCharge && Number(totals.serviceCharge || 0) > 0 ? renderLine('Service', formatMoney(totals.serviceCharge, currencyCode, decimals)) : ''}
          <div class="receipt-total-box">${renderLine(totalSection.totalLabel || 'TOTAL', formatMoney(totals.total, currencyCode, decimals), true)}</div>
          ${totalSection.showPaidAmount ? renderLine(totalSection.paidLabel || 'PAID', formatMoney(totals.paidAmount ?? totals.total, currencyCode, decimals)) : ''}
          ${totalSection.showBalanceDue && Number(totals.balanceDue || 0) > 0 ? renderLine(totalSection.balanceLabel || 'BALANCE', formatMoney(totals.balanceDue, currencyCode, decimals)) : ''}
          ${totalSection.showChange && Number(totals.change || 0) >= 0 ? renderLine(totalSection.changeLabel || 'CHANGE', formatMoney(totals.change || 0, currencyCode, decimals)) : ''}
        </div>
        <div class="receipt-footer receipt-center">
          ${payload.footer_text ? `<div>${escapeHtml(payload.footer_text)}</div>` : ''}
          ${payload.website ? `<div>${escapeHtml(payload.website)}</div>` : ''}
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
