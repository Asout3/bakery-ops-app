import { useMemo, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import ReceiptPreview from '../receipts/ReceiptPreview';
import { getReprintPolicyState, normalizeReceiptSettings, normalizeReceiptTemplate } from '../receipts/helpers';
import { performReceiptPrint } from '../receipts/printService';
import api, { getErrorMessage } from '../api/axios';

function buildPrintSummaryFallback(sale, settings) {
  const normalized = normalizeReceiptSettings(settings || {});
  return sale.print_summary || {
    receipt_generated: Boolean(sale.receipt_number),
    printed: false,
    print_attempts: 0,
    last_print_result: 'unprinted',
    last_printed_by: null,
    reprint_count: 0,
    reprints_remaining: normalized.reprintPolicy.maxManualReprints,
    in_reprint_window: true,
  };
}

export default function SaleReceiptDetail({ sale, settings, currentRole = 'cashier', onClose, onSaleUpdated, toast }) {
  const [printing, setPrinting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [itemQuantities, setItemQuantities] = useState(() => (sale.items || []).reduce((acc, item) => ({ ...acc, [item.product_id]: String(item.quantity) }), {}));
  const activeSettings = normalizeReceiptSettings(settings || sale.settings || {});
  const template = normalizeReceiptTemplate(sale.receipt_template_snapshot || sale.receipt_payload?.settings?.template || {});
  const printSummary = buildPrintSummaryFallback(sale, activeSettings);
  const reprintState = getReprintPolicyState(printSummary, activeSettings, currentRole);
  const printLabel = useMemo(() => (sale.status === 'voided' ? activeSettings.labels.voided : activeSettings.labels.reprint), [activeSettings, sale.status]);

  const handleReprint = async () => {
    setPrinting(true);
    try {
      await performReceiptPrint({
        sale,
        template,
        settings: activeSettings,
        adapterMode: activeSettings.printerProfile.saleAdapter || 'browser',
        attemptType: sale.status === 'voided' ? 'void_reprint' : 'manual_reprint',
        printLabel,
      });
      toast?.success?.('Receipt reprint started.');
      onSaleUpdated?.();
    } catch (error) {
      toast?.error?.(error.response?.data?.error || error.message || 'Reprint failed.');
    } finally {
      setPrinting(false);
    }
  };

  const handleSaveSaleEdit = async () => {
    const items = (sale.items || []).map((item) => ({
      product_id: item.product_id,
      quantity: Number(itemQuantities[item.product_id]),
    }));
    if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      toast?.error?.('Quantity must be greater than zero.');
      return;
    }

    setSavingEdit(true);
    try {
      await api.put(`/sales/${sale.id}/items`, { items });
      toast?.success?.('Sale updated successfully.');
      onSaleUpdated?.();
      onClose?.();
    } catch (error) {
      toast?.error?.(getErrorMessage(error, 'Failed to update sale.'));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Receipt Details - {sale.receipt_number}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="row g-4">
            <div className="col-lg-6">
              <h5>Print Status</h5>
              <p><strong>Receipt generated:</strong> {printSummary.receipt_generated ? 'Yes' : 'No'}</p>
              <p><strong>Printed:</strong> {printSummary.printed ? 'Yes' : 'No'}</p>
              <p><strong>Print attempts:</strong> {printSummary.print_attempts || 0}</p>
              <p><strong>Last result:</strong> {printSummary.last_print_result || 'unprinted'}</p>
              <p><strong>Last printed by:</strong> {printSummary.last_printed_by || '-'}</p>
              <p><strong>Reprints used:</strong> {printSummary.reprint_count || 0}</p>
              <p><strong>Reprints remaining:</strong> {printSummary.reprints_remaining ?? activeSettings.reprintPolicy.maxManualReprints}</p>
              <p><strong>Inside 20-minute window:</strong> {printSummary.in_reprint_window ? 'Yes' : 'No'}</p>
              <p><strong>Voided:</strong> {sale.status === 'voided' ? 'Yes' : 'No'}</p>
              {sale.is_offline ? <p><strong>Offline sale:</strong> Yes</p> : null}
              <div className="d-flex gap-2 flex-wrap mt-3">
                <button className="btn btn-outline-primary" onClick={handleReprint} disabled={!reprintState.allowed || printing}>
                  {printing ? <RefreshCw size={14} className="spin" /> : <Printer size={14} />} Reprint Receipt
                </button>
                {sale.status !== 'voided' ? <button className="btn btn-outline-secondary" onClick={handleSaveSaleEdit} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Item Changes'}</button> : null}
                {!reprintState.allowed ? <span className="text-muted small align-self-center">Reprints are restricted by window or count policy.</span> : null}
              </div>
              <div className="mt-3">
                <h6>Edit Item Quantities</h6>
                {(sale.items || []).map((item) => (
                  <div key={item.product_id} className="d-flex align-items-center justify-content-between mb-2 gap-2">
                    <span>{item.product_name}</span>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      style={{ maxWidth: '110px' }}
                      value={itemQuantities[item.product_id] ?? String(item.quantity)}
                      onChange={(e) => setItemQuantities((prev) => ({ ...prev, [item.product_id]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              {(printSummary.print_events || []).length > 0 ? (
                <div className="mt-4">
                  <h6>Print Audit</h6>
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead><tr><th>Type</th><th>Adapter</th><th>Status</th><th>Time</th></tr></thead>
                      <tbody>
                        {printSummary.print_events.map((event) => (
                          <tr key={event.event_id || `${event.attempt_type}-${event.initiated_at}`}>
                            <td>{event.attempt_type}</td>
                            <td>{event.adapter_mode}</td>
                            <td>{event.status}</td>
                            <td>{new Date(event.completed_at || event.initiated_at || Date.now()).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="col-lg-6 d-flex justify-content-center">
              <ReceiptPreview sale={sale} template={template} settings={activeSettings} printLabel={sale.status === 'voided' ? activeSettings.labels.voided : ''} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
