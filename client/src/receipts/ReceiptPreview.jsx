import './Receipt.css';
import { formatMoney, normalizeReceiptTemplate, resolveReceiptItemLayoutMetrics } from './helpers.js';

const FONT_FAMILY_MAP = {
  courier: "'Courier New', monospace",
  sans: 'Inter, Arial, sans-serif',
  serif: "Georgia, 'Times New Roman', serif",
};

export default function ReceiptPreview({ sale, template, settings, printLabel = '' }) {
  const normalizedTemplate = normalizeReceiptTemplate(template || {});
  const payload = sale.receipt_payload || {};
  const items = payload.items || sale.items || [];
  const totals = payload.totals || {};
  const currency = payload.currency_code || normalizedTemplate.sections.transaction.currencyCode || 'ETB';
  const decimals = Number(payload.decimals ?? normalizedTemplate.sections.transaction.decimals ?? 2);
  const separator = normalizedTemplate.separatorStyle === 'dotted' ? '. '.repeat(24) : '-'.repeat(32);
  const typography = normalizedTemplate.typography || {};
  const itemLayout = normalizedTemplate.sections.items || {};
  const transaction = normalizedTemplate.sections.transaction || {};
  const totalSection = normalizedTemplate.sections.totals || {};
  const customerLabel = payload.customer_phone ? `${payload.customer_name || 'Customer'} · ${payload.customer_phone}` : (payload.customer_name || '');
  const receiptDate = payload.sale_date || sale.sale_date || sale.created_at || null;
  const itemMetrics = resolveReceiptItemLayoutMetrics(itemLayout, normalizedTemplate.paperWidth);
  const previewStyle = {
    '--receipt-font-family': FONT_FAMILY_MAP[typography.fontFamily] || FONT_FAMILY_MAP.courier,
    '--receipt-base-font-size': `${Number(typography.baseFontSize || 12)}px`,
    '--receipt-business-font-size': `${Number(typography.businessNameFontSize || 19)}px`,
    '--receipt-meta-font-size': `${Number(typography.metaFontSize || typography.baseFontSize || 12)}px`,
    '--receipt-line-height': Number(typography.lineHeight || 1.35),
    '--receipt-item-gap': `${itemMetrics.itemGap}px`,
    '--receipt-column-gap': `${itemMetrics.columnGap}px`,
    '--receipt-qty-width': `${itemMetrics.quantityWidth}px`,
    '--receipt-total-width': `${itemMetrics.totalWidth}px`,
    '--receipt-values-width': `${itemMetrics.valuesWidth}px`,
    '--receipt-header-align': typography.headerAlignment || 'center',
    '--receipt-body-align': typography.bodyAlignment || 'left',
    '--receipt-footer-align': typography.footerAlignment || 'center',
  };

  return (
    <div className={`thermal-receipt thermal-${normalizedTemplate.paperWidth}`} style={previewStyle}>
      <div className="thermal-receipt__header thermal-receipt__header--center">
        {printLabel ? <div className="thermal-receipt__stamp">{printLabel}</div> : null}
        {sale.status === 'voided' ? <div className="thermal-receipt__stamp">{settings?.labels?.voided || 'VOIDED'}</div> : null}
        <div className="thermal-receipt__business">{payload.header_lines?.[0] || normalizedTemplate.sections.header.businessName}</div>
        {(payload.header_lines || []).slice(1).map((line) => <div key={line}>{line}</div>)}
      </div>
      <pre className="thermal-receipt__separator">{separator}</pre>
      <div className="thermal-receipt__meta">
        {transaction.showReceiptNumber ? <div className="thermal-receipt__line"><span>Receipt</span><span>{payload.receipt_number || sale.receipt_number}</span></div> : null}
        {transaction.showDateTime && receiptDate ? <div className="thermal-receipt__line"><span>Date</span><span>{new Date(receiptDate).toLocaleString()}</span></div> : null}
        {transaction.showCashier ? <div className="thermal-receipt__line"><span>{normalizedTemplate.sections.header.cashierLabel || 'Cashier'}</span><span>{payload.cashier_name || sale.cashier_name}</span></div> : null}
        {transaction.showPaymentMethod ? <div className="thermal-receipt__line"><span>Payment</span><span>{payload.payment_method || sale.payment_method}</span></div> : null}
        {transaction.showCustomerInfo && customerLabel ? <div className="thermal-receipt__line"><span>Customer</span><span>{customerLabel}</span></div> : null}
        {transaction.showInternalRef && payload.internal_ref ? <div className="thermal-receipt__line"><span>Reference</span><span>{payload.internal_ref}</span></div> : null}
        {transaction.showNotes && payload.notes ? <div className="thermal-receipt__note">{payload.notes}</div> : null}
      </div>
      <pre className="thermal-receipt__separator">{separator}</pre>
      <div className="thermal-receipt__items-header">
        <span>ITEM</span>
        <span className="thermal-receipt__item-values">
          <span>{itemLayout.quantityLabel || 'QTY'}</span>
          <span>{itemLayout.totalLabel || 'TOTAL'}</span>
        </span>
      </div>
      <div className="thermal-receipt__items">
        {items.map((item) => (
          <div key={`${item.product_id || item.product_name}-${item.product_name}`} className="thermal-receipt__item">
            <div className="thermal-receipt__item-row">
              <span className="thermal-receipt__item-name">{item.product_name}</span>
              <span className="thermal-receipt__item-values">
                <span className="thermal-receipt__item-qty">{item.quantity}</span>
                <span className="thermal-receipt__item-total">{formatMoney(item.subtotal, currency, decimals)}</span>
              </span>
            </div>
            {itemLayout.showUnitPrice ? <div className="thermal-receipt__item-price">{formatMoney(item.unit_price, currency, decimals)} ea</div> : null}
          </div>
        ))}
      </div>
      <pre className="thermal-receipt__separator">{separator}</pre>
      <div className="thermal-receipt__totals">
        {totalSection.showSubtotal ? <div className="thermal-receipt__line"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency, decimals)}</span></div> : null}
        {totalSection.showDiscounts && Number(totals.discounts || 0) > 0 ? <div className="thermal-receipt__line"><span>Discounts</span><span>{formatMoney(totals.discounts, currency, decimals)}</span></div> : null}
        {totalSection.showTax && Number(totals.tax || 0) > 0 ? <div className="thermal-receipt__line"><span>Tax</span><span>{formatMoney(totals.tax, currency, decimals)}</span></div> : null}
        {totalSection.showServiceCharge && Number(totals.serviceCharge || 0) > 0 ? <div className="thermal-receipt__line"><span>Service</span><span>{formatMoney(totals.serviceCharge, currency, decimals)}</span></div> : null}
        <div className="thermal-receipt__line thermal-receipt__line--bold"><span>{totalSection.totalLabel || 'TOTAL'}</span><span>{formatMoney(totals.total, currency, decimals)}</span></div>
        {totalSection.showPaidAmount ? <div className="thermal-receipt__line"><span>{totalSection.paidLabel || 'PAID'}</span><span>{formatMoney(totals.paidAmount ?? totals.total, currency, decimals)}</span></div> : null}
        {totalSection.showBalanceDue && Number(totals.balanceDue || 0) > 0 ? <div className="thermal-receipt__line"><span>{totalSection.balanceLabel || 'BALANCE'}</span><span>{formatMoney(totals.balanceDue, currency, decimals)}</span></div> : null}
        {totalSection.showChange ? <div className="thermal-receipt__line"><span>{totalSection.changeLabel || 'CHANGE'}</span><span>{formatMoney(totals.change || 0, currency, decimals)}</span></div> : null}
      </div>
      <div className="thermal-receipt__footer thermal-receipt__header--center">
        {payload.footer_text ? <div>{payload.footer_text}</div> : null}
        {payload.legal_text ? <div>{payload.legal_text}</div> : null}
        {payload.qr_value ? <div>{payload.qr_value}</div> : null}
      </div>
    </div>
  );
}
