import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Search, Clock, DollarSign, Receipt, AlertTriangle, X, RotateCcw } from 'lucide-react';

const VOID_WINDOW_MINUTES = 20;

export default function CashierHistory() {
  const { selectedLocationId } = useBranch();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [message, setMessage] = useState(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    searchTerm: ''
  });

  useEffect(() => {
    fetchSales();
  }, [selectedLocationId]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const response = await api.get('/sales');
      setSales(response.data);
    } catch (err) {
      console.error('Failed to fetch sales:', err);
      setMessage({ type: 'danger', text: 'Failed to load sales history' });
    } finally {
      setLoading(false);
    }
  };

  const canVoidSale = (sale) => {
    if (sale.status === 'voided') return false;
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
    if (!selectedSale) return;
    if (!voidReason.trim()) {
      setMessage({ type: 'warning', text: 'Please provide a reason for voiding this sale' });
      return;
    }

    setVoiding(true);
    try {
      await api.post(`/sales/${selectedSale.id}/void`, { reason: voidReason });
      setMessage({ type: 'success', text: `Sale ${selectedSale.receipt_number} has been voided. Inventory restored.` });
      setSelectedSale(null);
      setVoidReason('');
      fetchSales();
    } catch (err) {
      setMessage({ 
        type: 'danger', 
        text: err.response?.data?.error || 'Failed to void sale' 
      });
    } finally {
      setVoiding(false);
    }
  };

  const filteredSales = sales.filter(sale => {
    if (filters.startDate && new Date(sale.sale_date) < new Date(filters.startDate)) return false;
    if (filters.endDate && new Date(sale.sale_date) > new Date(filters.endDate + 'T23:59:59')) return false;
    if (filters.searchTerm && 
        !sale.receipt_number.toLowerCase().includes(filters.searchTerm.toLowerCase()) &&
        !sale.total_amount.toString().includes(filters.searchTerm)) return false;
    return true;
  });

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

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
        <h2>Sales History</h2>
      </div>

      {message && (
        <div className={`alert alert-${message.type} mb-3`}>
          {message.text}
        </div>
      )}

      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Start Date</label>
              <input
                type="date"
                className="form-control"
                value={filters.startDate}
                onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">End Date</label>
              <input
                type="date"
                className="form-control"
                value={filters.endDate}
                onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Search</label>
              <div className="input-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Receipt # or Amount"
                  value={filters.searchTerm}
                  onChange={(e) => setFilters({...filters, searchTerm: e.target.value})}
                />
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
                  <th>Receipt #</th>
                  <th>Date & Time</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center text-muted py-4">
                      No sales found
                    </td>
                  </tr>
                ) : (
                  filteredSales.map(sale => (
                    <tr key={sale.id} className={sale.status === 'voided' ? 'table-secondary' : ''}>
                      <td>
                        {sale.receipt_number}
                        {sale.status === 'voided' && (
                          <span className="badge badge-danger ms-2">VOIDED</span>
                        )}
                      </td>
                      <td>
                        <div>{new Date(sale.sale_date).toLocaleDateString()}</div>
                        <small className="text-muted">
                          {new Date(sale.sale_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </td>
                      <td>
                        <span className={`fw-bold ${sale.status === 'voided' ? 'text-muted text-decoration-line-through' : 'text-success'}`}>
                          ${Number(sale.total_amount).toFixed(2)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${sale.payment_method === 'cash' ? 'badge-success' : sale.payment_method === 'card' ? 'badge-primary' : 'badge-info'}`}>
                          {sale.payment_method}
                        </span>
                      </td>
                      <td>
                        {canVoidSale(sale) && (
                          <span className="badge badge-warning">
                            <Clock size={12} className="me-1" />
                            {getMinutesRemaining(sale)}m to void
                          </span>
                        )}
                        {sale.status === 'voided' && (
                          <span className="badge badge-secondary">Cancelled</span>
                        )}
                        {!canVoidSale(sale) && sale.status !== 'voided' && (
                          <span className="badge badge-success">Completed</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            className="btn btn-sm btn-outline-primary"
                            onClick={async () => {
                              try {
                                const res = await api.get(`/sales/${sale.id}`);
                                setSelectedSale(res.data);
                              } catch (err) {
                                console.error('Failed to load sale details');
                              }
                            }}
                          >
                            <Receipt size={14} /> View
                          </button>
                          {canVoidSale(sale) && (
                            <button 
                              className="btn btn-sm btn-outline-danger"
                              onClick={async () => {
                                try {
                                  const res = await api.get(`/sales/${sale.id}`);
                                  setSelectedSale(res.data);
                                } catch (err) {
                                  console.error('Failed to load sale details');
                                }
                              }}
                            >
                              <X size={14} /> Void
                            </button>
                          )}
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

      {selectedSale && (
        <div className="modal-overlay" onClick={() => { setSelectedSale(null); setVoidReason(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {selectedSale.receipt_number}
                {selectedSale.status === 'voided' && (
                  <span className="badge badge-danger ms-2">VOIDED</span>
                )}
              </h3>
              <button className="close-btn" onClick={() => { setSelectedSale(null); setVoidReason(''); }}>×</button>
            </div>
            <div className="modal-body">
              <div className="row">
                <div className="col-md-6">
                  <h5>Transaction Info</h5>
                  <p><strong>Date & Time:</strong> {new Date(selectedSale.sale_date).toLocaleString()}</p>
                  <p><strong>Amount:</strong> ${Number(selectedSale.total_amount).toFixed(2)}</p>
                  <p><strong>Payment Method:</strong> {selectedSale.payment_method}</p>
                  {selectedSale.status === 'voided' && (
                    <div className="alert alert-warning">
                      <strong>Voided at:</strong> {new Date(selectedSale.voided_at).toLocaleString()}<br/>
                      <strong>Reason:</strong> {selectedSale.void_reason}
                    </div>
                  )}
                </div>
                <div className="col-md-6">
                  <h5>Items ({selectedSale.items?.length || 0})</h5>
                </div>
              </div>
              
              <div className="mt-3">
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSale.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.product_name}</td>
                          <td>{item.quantity}</td>
                          <td>${Number(item.unit_price).toFixed(2)}</td>
                          <td>${Number(item.subtotal).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan="3">Total:</th>
                        <th>${Number(selectedSale.total_amount).toFixed(2)}</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {canVoidSale(selectedSale) && (
                <div className="mt-4 p-3 bg-light rounded">
                  <h5 className="text-danger">
                    <AlertTriangle size={18} className="me-2" />
                    Void This Sale?
                  </h5>
                  <p className="text-muted small">
                    You have <strong>{getMinutesRemaining(selectedSale)} minutes</strong> remaining to void this sale.
                    Inventory will be restored automatically.
                  </p>
                  <div className="mb-3">
                    <label className="form-label">Reason for voiding *</label>
                    <textarea
                      className="form-control"
                      rows="2"
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      placeholder="e.g., Customer changed their mind, entered wrong amount..."
                    />
                  </div>
                  <button 
                    className="btn btn-danger"
                    onClick={handleVoidSale}
                    disabled={voiding || !voidReason.trim()}
                  >
                    {voiding ? (
                      <>Processing...</>
                    ) : (
                      <><X size={16} className="me-1" /> Void Sale & Restore Inventory</>
                    )}
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setSelectedSale(null); setVoidReason(''); }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
