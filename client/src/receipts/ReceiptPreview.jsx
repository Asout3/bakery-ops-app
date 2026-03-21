import './Receipt.css';
import { formatMoney, normalizeReceiptTemplate } from './helpers';

export default function ReceiptPreview({ sale, template, settings, printLabel = '' }) {
  const normalizedTemplate = normalizeReceiptTemplate(template || {});
  const payload = sale.receipt_payload || {};
  const items = payload.items || sale.items || [];
  const totals = payload.totals || {};
  const currency = payload.currency_code || normalizedTemplate.sections.transaction.currencyCode || 'ETB';
  const decimals = Number(payload.decimals ?? normalizedTemplate.sections.transaction.decimals ?? 2);
  const separator = normalizedTemplate.separatorStyle === 'dotted' ? '. '.repeat(24) : '-'.repeat(32);

  return (
    <div className={`thermal-receipt thermal-${normalizedTemplate.paperWidth}`}>
      <div className="thermal-receipt__header thermal-receipt__header--center">
        {printLabel ? <div className="thermal-receipt__stamp">{printLabel}</div> : null}
        {sale.status === 'voided' ? <div className="thermal-receipt__stamp">{settings?.labels?.voided || 'VOIDED'}</div> : null}
        <div className="thermal-receipt__business">{payload.header_lines?.[0] || normalizedTemplate.sections.header.businessName}</div>
        {(payload.header_lines || []).slice(1).map((line) => <div key={line}>{line}</div>)}
      </div>
      <pre className="thermal-receipt__separator">{separator}</pre>
      <div className="thermal-receipt__meta">
        {normalizedTemplate.sections.transaction.showReceiptNumber ? <div className="thermal-receipt__line"><span>Receipt</span><span>{payload.receipt_number || sale.receipt_number}</span></div> : null}
        {normalizedTemplate.sections.transaction.showDateTime ? <div className="thermal-receipt__line"><span>Date</span><span>{new Date(payload.sale_date || sale.sale_date || Date.now()).toLocaleString()}</span></div> : null}
        {normalizedTemplate.sections.transaction.showCashier ? <div className="thermal-receipt__line"><span>{normalizedTemplate.sections.header.cashierLabel || 'Cashier'}</span><span>{payload.cashier_name || sale.cashier_name}</span></div> : null}
        {normalizedTemplate.sections.transaction.showPaymentMethod ? <div className="thermal-receipt__line"><span>Payment</span><span>{payload.payment_method || sale.payment_method}</span></div> : null}
      </div>
      <pre className="thermal-receipt__separator">{separator}</pre>
      <div className="thermal-receipt__items-header">
        <span>ITEM</span>
        <span>{normalizedTemplate.sections.items.quantityLabel || 'QTY'}</span>
        <span>{normalizedTemplate.sections.items.totalLabel || 'TOTAL'}</span>
      </div>
      <div className="thermal-receipt__items">
        {items.map((item) => (
          <div key={`${item.product_id}-${item.product_name}`} className="thermal-receipt__item">
            <div className="thermal-receipt__item-row">
              <span className="thermal-receipt__item-name">{item.product_name}</span>
              <span className="thermal-receipt__item-qty">{item.quantity}</span>
              <span className="thermal-receipt__item-total">{formatMoney(item.subtotal, currency, decimals)}</span>
            </div>
            {normalizedTemplate.sections.items.showUnitPrice ? <div className="thermal-receipt__item-price">{formatMoney(item.unit_price, currency, decimals)} ea</div> : null}
          </div>
        ))}
      </div>
      <pre className="thermal-receipt__separator">{separator}</pre>
      <div className="thermal-receipt__totals">
        {normalizedTemplate.sections.totals.showSubtotal ? <div className="thermal-receipt__line"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency, decimals)}</span></div> : null}
        {normalizedTemplate.sections.totals.showDiscounts && Number(totals.discounts || 0) > 0 ? <div className="thermal-receipt__line"><span>Discounts</span><span>{formatMoney(totals.discounts, currency, decimals)}</span></div> : null}
        {normalizedTemplate.sections.totals.showTax && Number(totals.tax || 0) > 0 ? <div className="thermal-receipt__line"><span>Tax</span><span>{formatMoney(totals.tax, currency, decimals)}</span></div> : null}
        {normalizedTemplate.sections.totals.showServiceCharge && Number(totals.serviceCharge || 0) > 0 ? <div className="thermal-receipt__line"><span>Service</span><span>{formatMoney(totals.serviceCharge, currency, decimals)}</span></div> : null}
        <div className="thermal-receipt__line thermal-receipt__line--bold"><span>{normalizedTemplate.sections.totals.totalLabel || 'TOTAL'}</span><span>{formatMoney(totals.total, currency, decimals)}</span></div>
        {normalizedTemplate.sections.totals.showPaidAmount ? <div className="thermal-receipt__line"><span>{normalizedTemplate.sections.totals.paidLabel || 'PAID'}</span><span>{formatMoney(totals.paidAmount ?? totals.total, currency, decimals)}</span></div> : null}
        {normalizedTemplate.sections.totals.showChange ? <div className="thermal-receipt__line"><span>{normalizedTemplate.sections.totals.changeLabel || 'CHANGE'}</span><span>{formatMoney(totals.change || 0, currency, decimals)}</span></div> : null}
      </div>
      <div className="thermal-receipt__footer thermal-receipt__header--center">
        {payload.footer_text ? <div>{payload.footer_text}</div> : null}
        {payload.legal_text ? <div>{payload.legal_text}</div> : null}
        {payload.qr_value ? <div>{payload.qr_value}</div> : null}
      </div>
    </div>
  );
}
