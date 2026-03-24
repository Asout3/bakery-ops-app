import { normalizeReceiptTemplate } from './helpers.js';

export function buildPreOrderReceipt(order, template) {
  const normalizedTemplate = normalizeReceiptTemplate(template || {});
  const totalAmount = Number(order.total_amount || 0);
  const taxPercent = Number(normalizedTemplate.sections.header.taxPercent || 0);
  const taxAmount = Number((totalAmount * taxPercent / 100).toFixed(2));
  const grandTotal = totalAmount + taxAmount;
  const paidAmount = Number(order.paid_amount || 0);
  const balanceDue = Math.max(grandTotal - paidAmount, 0);
  const change = Math.max(paidAmount - grandTotal, 0);
  const receiptNumber = order.order_code || `ORD-${String(order.id || 'LOCAL').padStart(6, '0')}`;
  const header = normalizedTemplate.sections.header;
  const footer = normalizedTemplate.sections.footer;
  const note = order.customer_note || '';
  const items = (order.items || []).map((item) => ({
    product_id: item.product_id,
    product_name: item.custom_item_name || item.product_name || `Product #${item.product_id}`,
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
    subtotal: Number(item.subtotal || (Number(item.quantity || 0) * Number(item.unit_price || 0))),
  }));

  return {
    id: `order-${order.id || receiptNumber}`,
    receipt_number: receiptNumber,
    sale_date: order.created_at || order.updated_at || new Date().toISOString(),
    payment_method: order.payment_method || 'cash',
    cashier_name: order.cashier_name || 'Cashier',
    status: order.status === 'cancelled' ? 'voided' : 'completed',
    receipt_payload: {
      receipt_number: receiptNumber,
      sale_date: order.created_at || order.updated_at || new Date().toISOString(),
      payment_method: order.payment_method || 'cash',
      cashier_name: order.cashier_name || 'Cashier',
      customer_name: order.customer_name || '',
      customer_phone: order.customer_phone || '',
      internal_ref: order.order_code || `Order #${order.id}`,
      notes: [
        order.pickup_at ? `Pickup: ${new Date(order.pickup_at).toLocaleString()}` : '',
        note,
      ].filter(Boolean).join('\n'),
      header_lines: [
        header.businessName,
        header.branchName,
        header.slogan,
        header.address,
        header.phone,
        order.pickup_at ? `Pickup: ${new Date(order.pickup_at).toLocaleString()}` : '',
      ].filter(Boolean),
      currency_code: normalizedTemplate.sections.transaction.currencyCode || 'ETB',
      decimals: Number(normalizedTemplate.sections.transaction.decimals ?? 2),
      items,
      totals: {
        subtotal: totalAmount,
        tax: taxAmount,
        discounts: 0,
        serviceCharge: 0,
        total: grandTotal,
        paidAmount,
        balanceDue,
        change,
      },
      footer_text: footer.footerText || '',
      website: footer.website || '',
    },
  };
}
