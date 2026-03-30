import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Eye, DollarSign, CreditCard, Calendar, Search, RotateCcw } from 'lucide-react';
import { formatAddisDateTime } from '../../utils/time';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getReceiptConfigCache, normalizeReceiptSettings } from '../../receipts/helpers';
import SaleReceiptDetail from '../../components/SaleReceiptDetail';
import './Sales.css';

const initialFilters = {
  startDate: '',
  endDate: '',
  paymentMethod: '',
  status: '',
  searchTerm: ''
};

export default function SalesPage() {
  const { selectedLocationId } = useBranch();
  const { user } = useAuth();
  const toast = useToast();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const cachedConfig = getReceiptConfigCache();
  const receiptSettings = normalizeReceiptSettings(cachedConfig?.settings || {});

  useEffect(() => {
    fetchData();
  }, [selectedLocationId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const salesRes = await api.get('/sales');
      setSales(salesRes.data || []);
    } catch (err) {
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  const openSaleDetails = async (sale) => {
    setDetailLoading(true);
    try {
      const response = await api.get(`/sales/${sale.id}`);
      setSelectedSale(response.data);
    } catch {
      setSelectedSale(sale);
      toast.error('Could not load full sale details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredSales = useMemo(() => sales.filter((sale) => {
    const saleDate = new Date(sale.sale_date);
    if (filters.startDate && saleDate < new Date(filters.startDate)) return false;
    if (filters.endDate && saleDate > new Date(`${filters.endDate}T23:59:59`)) return false;
    if (filters.paymentMethod && sale.payment_method !== filters.paymentMethod) return false;
    if (filters.status && sale.status !== filters.status) return false;

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const receipt = String(sale.receipt_number || '').toLowerCase();
      const cashier = String(sale.cashier_name || sale.cashier_id || '').toLowerCase();
      const amount = String(Number(sale.total_amount || 0).toFixed(2));
      if (!receipt.includes(term) && !cashier.includes(term) && !amount.includes(term)) return false;
    }

    return true;
  }), [sales, filters]);

  const totalAmount = filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="sales-page">
      <div className="page-header" style={{ gap: '1rem', flexWrap: 'wrap' }}>
        <h2>Sales Records</h2>
      </div>

      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
            <h5 className="mb-0">Filters</h5>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setFilters(initialFilters)}>
              <RotateCcw size={14} className="me-1" /> Clear Filters
            </button>
          </div>
          <div className="row g-3">
            <div className="col-md-3"><label className="form-label">Start Date</label><input type="date" className="form-control" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /></div>
            <div className="col-md-3"><label className="form-label">End Date</label><input type="date" className="form-control" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} /></div>
            <div className="col-md-3"><label className="form-label">Payment Method</label><select className="form-select" value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}><option value="">All Methods</option><option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile Banking</option><option value="telebirr">Telebirr</option></select></div>
            <div className="col-md-3"><label className="form-label">Status</label><select className="form-select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All Statuses</option><option value="completed">Completed</option><option value="voided">Voided</option><option value="sent">Sent</option><option value="edited">Edited</option></select></div>
            <div className="col-md-3"><label className="form-label">Search</label><div className="input-group"><input type="text" className="form-control" placeholder="Receipt #, cashier, amount" value={filters.searchTerm} onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })} /><span className="input-group-text"><Search size={16} /></span></div></div>
          </div>
        </div>
      </div>

      {detailLoading ? <div className="alert alert-info mb-3">Loading sale details...</div> : null}
      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light"><div className="stat-icon bg-success text-white"><DollarSign size={24} /></div><div className="stat-content"><h3>ETB {totalAmount.toFixed(2)}</h3><p>Total Sales</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-primary text-white"><CreditCard size={24} /></div><div className="stat-content"><h3>{filteredSales.length}</h3><p>Total Transactions</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-info text-white"><Calendar size={24} /></div><div className="stat-content"><h3>ETB {filteredSales.length > 0 ? (totalAmount / filteredSales.length).toFixed(2) : '0.00'}</h3><p>Avg. Transaction</p></div></div>
      </div>
      <div className="card"><div className="card-body"><div className="table-responsive"><table className="table table-hover"><thead><tr><th>Receipt #</th><th>Date & Time</th><th>Amount</th><th>Payment Method</th><th>Status</th><th>Void Details</th><th>Cashier</th><th>Actions</th></tr></thead><tbody>
        {filteredSales.length === 0 ? <tr><td colSpan="8" className="text-center text-muted py-4">No sales found</td></tr> : filteredSales.map((sale) => (
          <tr key={sale.id}><td>{sale.receipt_number}{sale.last_print_result === 'failed' ? <span className="badge badge-danger ms-2">Print issue</span> : null}</td><td>{formatAddisDateTime(sale.sale_date, { hour12: true })}</td><td>ETB {Number(sale.total_amount).toFixed(2)}</td><td><span className={`badge ${sale.payment_method === 'cash' ? 'badge-success' : sale.payment_method === 'card' || sale.payment_method === 'telebirr' ? 'badge-primary' : 'badge-info'}`}>{sale.payment_method}</span></td><td>{sale.is_offline ? <span className="badge badge-warning">Offline</span> : <span className="badge badge-success">Online</span>}<div className="small text-muted">Prints {sale.print_attempts || 0} · Reprints {sale.reprint_count || 0}</div></td><td>{sale.status === 'voided' ? <div><small className="text-muted d-block">{formatAddisDateTime(sale.voided_at, { hour12: true })}</small><small className="text-danger">{sale.void_reason || 'No reason provided'}</small></div> : <span className="text-muted">-</span>}</td><td>{sale.cashier_name || sale.cashier_id}</td><td><button className="btn btn-sm btn-outline-primary" onClick={() => openSaleDetails(sale)}><Eye size={14} /> View</button></td></tr>
        ))}
      </tbody></table></div></div></div>

      {selectedSale ? <SaleReceiptDetail sale={selectedSale} settings={receiptSettings} currentRole={user?.role || 'admin'} onClose={() => setSelectedSale(null)} onSaleUpdated={fetchData} toast={toast} /> : null}
    </div>
  );
}
