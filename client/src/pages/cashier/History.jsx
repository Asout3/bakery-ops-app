import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import './History.css';
import { useBranch } from '../../context/BranchContext';
import { Search, Clock, Receipt, AlertTriangle, X } from 'lucide-react';
import { formatAddisDateTime } from '../../utils/time';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getReceiptConfigCache, normalizeReceiptSettings } from '../../receipts/helpers';
import { listLocalReceiptRecords } from '../../receipts/storage';
import SaleReceiptDetail from '../../components/SaleReceiptDetail';

const VOID_WINDOW_MINUTES = 20;

export default function CashierHistory() {
  const { selectedLocationId } = useBranch();
  const { t } = useLanguage();
  const { user } = useAuth();
  const toast = useToast();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [message, setMessage] = useState(null);
  const [detailMode, setDetailMode] = useState('view');
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    searchTerm: '',
    specificDay: ''
  });
  const cachedConfig = getReceiptConfigCache();
  const receiptSettings = normalizeReceiptSettings(cachedConfig?.settings || {});

  useEffect(() => {
    fetchSales();
  }, [selectedLocationId, filters.specificDay]);

  const mergeServerAndLocalSales = (serverSales = []) => {
    const localSales = listLocalReceiptRecords({ locationId: selectedLocationId || null });
    const existingKeys = new Set(serverSales.flatMap((sale) => [sale.client_transaction_id, sale.receipt_number]).filter(Boolean));
    const pendingLocals = localSales.filter((sale) => !existingKeys.has(sale.client_transaction_id) && !existingKeys.has(sale.receipt_number));
    return [...pendingLocals, ...serverSales].sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      const params = filters.specificDay ? { start_date: filters.specificDay, end_date: filters.specificDay } : {};
      const response = await api.get('/sales', { params });
      setSales(mergeServerAndLocalSales(response.data));
    } catch (err) {
      setSales(mergeServerAndLocalSales([]));
      setMessage({ type: 'danger', text: t('processFailedLoadSalesHistory') });
    } finally {
      setLoading(false);
    }
  };

  const canVoidSale = (sale) => {
    if (sale.local_only || sale.status === 'voided') return false;
    const saleTime = new Date(sale.sale_date);
    const now = new Date();
    const minutesSinceSale = (now - saleTime) / (1000 * 60);
    return minutesSinceSale <= VOID_WINDOW_MINUTES;
  };

  const getMinutesRemaining = (sale) => {
    const saleTime = new Date(sale.sale_date);
    const now = new Date();
    const minutesSinceSale = (now - saleTime) / (1000 * 60);
    return Math.max(0, Math.floor(VOID_WINDOW_MINUTES - minutesSinceSale));
  };

  const handleVoidSale = async () => {
    if (!selectedSale?.id) return;
    if (!voidReason.trim()) {
      setMessage({ type: 'warning', text: t('provideVoidReason') });
      return;
    }

    setVoiding(true);
    try {
      await api.post(`/sales/${selectedSale.id}/void`, { reason: voidReason });
      setMessage({ type: 'success', text: `${t('sales')} ${selectedSale.receipt_number} ${t('saleVoidedMessage')}` });
      setSelectedSale(null);
      setVoidReason('');
      fetchSales();
    } catch (err) {
      setMessage({ 
        type: 'danger', 
        text: err.response?.data?.error || t('failedVoidSale') 
      });
    } finally {
      setVoiding(false);
    }
  };

  const filteredSales = useMemo(() => sales.filter(sale => {
    if (!filters.specificDay && filters.startDate && new Date(sale.sale_date) < new Date(filters.startDate)) return false;
    if (!filters.specificDay && filters.endDate && new Date(sale.sale_date) > new Date(filters.endDate + 'T23:59:59')) return false;
    if (filters.searchTerm && 
        !String(sale.receipt_number || '').toLowerCase().includes(filters.searchTerm.toLowerCase()) &&
        !String(sale.total_amount || sale.receipt_payload?.totals?.total || '').includes(filters.searchTerm)) return false;
    return true;
  }), [sales, filters]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const openSaleDetails = async (sale, mode = 'view') => {
    setDetailMode(mode);
    if (!sale.id) {
      setSelectedSale(sale);
      return;
    }
    try {
      const res = await api.get(`/sales/${sale.id}`);
      setSelectedSale(res.data);
    } catch {
      setSelectedSale(sale);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="sales-history-page">
      <div className="page-header">
        <h2>{t('salesHistory')}</h2>
      </div>

      {message && (
        <div className={`alert alert-${message.type} mb-3`}>
          {message.text}
        </div>
      )}

      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">{t('startDate')}</label>
              <input type="date" className="form-control" value={filters.startDate} onChange={(e) => setFilters({...filters, startDate: e.target.value})} />
            </div>
            <div className="col-md-3">
              <label className="form-label">{t('endDate')}</label>
              <input type="date" className="form-control" value={filters.endDate} onChange={(e) => setFilters({...filters, endDate: e.target.value})} />
            </div>
            <div className="col-md-3">
              <label className="form-label">{t('specificDayExact')}</label>
              <input type="date" className="form-control" value={filters.specificDay} onChange={(e) => setFilters({...filters, specificDay: e.target.value})} />
            </div>
            <div className="col-md-3">
              <label className="form-label">{t('search')}</label>
              <div className="input-group">
                <input type="text" className="form-control" placeholder={t('receiptOrAmount')} value={filters.searchTerm} onChange={(e) => setFilters({...filters, searchTerm: e.target.value})} />
                <span className="input-group-text"><Search size={16} /></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>{t('receipt')}</th>
                  <th>{t('dateTime')}</th>
                  <th>{t('amount')}</th>
                  <th>{t('cashier')}</th>
                  <th>{t('payment')}</th>
                  <th>{t('status')}</th>
                  <th>{t('voidDetails')}</th>
                  <th>{t('sync')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center text-muted py-4">{t('noSalesFound')}</td>
                  </tr>
                ) : (
                  filteredSales.map(sale => (
                    <tr key={sale.id || sale.client_transaction_id} className={sale.status === 'voided' ? 'table-secondary' : ''}>
                      <td>
                        {sale.receipt_number}
                        {sale.status === 'voided' ? <span className="badge badge-danger ms-2">{t('voided')}</span> : null}
                      </td>
                      <td>
                        <div>{new Date(sale.sale_date).toLocaleDateString()}</div>
                        <small className="text-muted">{formatAddisDateTime(sale.sale_date, { hour12: true })}</small>
                      </td>
                      <td><span className={`fw-bold ${sale.status === 'voided' ? 'text-muted text-decoration-line-through' : 'text-success'}`}>ETB {Number(sale.total_amount || sale.receipt_payload?.totals?.total || 0).toFixed(2)}</span></td>
                      <td>{sale.cashier_name || t('unknown')}</td>
                      <td><span className={`badge ${sale.payment_method === 'cash' ? 'badge-success' : sale.payment_method === 'card' || sale.payment_method === 'telebirr' ? 'badge-primary' : 'badge-info'}`}>{sale.payment_method}</span></td>
                      <td>
                        {canVoidSale(sale) ? (
                          <span className="badge badge-warning"><Clock size={12} className="me-1" />{getMinutesRemaining(sale)}m {t('voidRemainingSuffix')}</span>
                        ) : sale.status === 'voided' ? (
                          <span className="badge badge-secondary">{t('cancelled')}</span>
                        ) : (
                          <span className="badge badge-success">{t('completed')}</span>
                        )}
                        {sale.last_print_result === 'failed' ? <div><span className="badge badge-danger mt-1">Print issue</span></div> : null}
                      </td>
                      <td>
                        {sale.status === 'voided' ? (
                          <div><small className="text-muted d-block">{formatAddisDateTime(sale.voided_at, { hour12: true })}</small><small className="text-danger">{sale.void_reason || t('noReasonProvided')}</small></div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td>
                        {sale.local_only ? <span className="badge badge-warning">Queued</span> : sale.is_offline ? <span className="badge badge-warning">{t('offline')}</span> : <span className="badge badge-success">{t('online')}</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-sm btn-outline-primary" onClick={() => openSaleDetails(sale, 'view')}><Receipt size={14} /> {t('view')}</button>
                          {canVoidSale(sale) ? <button className="btn btn-sm btn-outline-danger" onClick={() => openSaleDetails(sale, 'void')}><X size={14} /> {t('void')}</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedSale && detailMode === 'view' && (
        <SaleReceiptDetail sale={selectedSale} settings={receiptSettings} currentRole={user?.role || 'cashier'} onClose={() => { setSelectedSale(null); setDetailMode('view'); }} onSaleUpdated={fetchSales} toast={toast} />
      )}

      {selectedSale && detailMode === 'void' && canVoidSale(selectedSale) && !selectedSale.local_only && (
        <div className="modal-overlay" onClick={() => { setSelectedSale(null); setVoidReason(''); setDetailMode('view'); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{selectedSale.receipt_number}</h3><button className="close-btn" onClick={() => { setSelectedSale(null); setVoidReason(''); setDetailMode('view'); }}>×</button></div>
            <div className="modal-body">
              <div className="row">
                <div className="col-md-6">
                  <h5>{t('transactionInfo')}</h5>
                  <p><strong>{t('dateAndTimeLabel')}</strong> {formatAddisDateTime(selectedSale.sale_date, { hour12: true })}</p>
                  <p><strong>{t('amountLabel')}</strong> ETB {Number(selectedSale.total_amount || 0).toFixed(2)}</p>
                  <p><strong>{t('cashierLabel')}</strong> {selectedSale.cashier_name || t('unknown')}</p>
                  <p><strong>{t('paymentMethodLabel')}</strong> {selectedSale.payment_method}</p>
                </div>
                <div className="col-md-6">
                  <h5>Receipt Audit</h5>
                  <p><strong>Printed:</strong> {selectedSale.print_summary?.printed ? 'Yes' : 'No'}</p>
                  <p><strong>Attempts:</strong> {selectedSale.print_summary?.print_attempts || 0}</p>
                  <p><strong>Last print result:</strong> {selectedSale.print_summary?.last_print_result || 'unprinted'}</p>
                </div>
              </div>
              <div className="mt-3 table-responsive">
                <table className="table table-sm">
                  <thead><tr><th>{t('product')}</th><th>{t('qty')}</th><th>{t('price')}</th><th>{t('total')}</th></tr></thead>
                  <tbody>
                    {(selectedSale.items || []).map((item, idx) => (
                      <tr key={idx}><td>{item.product_name}</td><td>{item.quantity}</td><td>ETB {Number(item.unit_price).toFixed(2)}</td><td>ETB {Number(item.subtotal).toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 bg-light rounded">
                <h5 className="text-danger"><AlertTriangle size={18} className="me-2" />{t('voidThisSale')}</h5>
                <p className="text-muted small">{t('remainingToVoidPrefix')} <strong>{getMinutesRemaining(selectedSale)} {t('voidRemainingSuffix')}</strong> {t('remainingToVoidMiddle')}{t('inventoryRestoredMessage')}</p>
                <div className="mb-3">
                  <label className="form-label">{t('reasonForVoiding')}</label>
                  <textarea className="form-control" rows="2" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder={t('reasonPlaceholder')} />
                </div>
                <button className="btn btn-danger" onClick={handleVoidSale} disabled={voiding || !voidReason.trim()}>{voiding ? <>{t('processingShort')}</> : <>{t('voidSaleRestoreInventory')}</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
