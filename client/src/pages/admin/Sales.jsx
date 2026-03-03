import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Eye, DollarSign, CreditCard, Calendar, Search, RotateCcw } from 'lucide-react';
import { formatAddisDateTime } from '../../utils/time';

const initialFilters = {
  startDate: '',
  endDate: '',
  paymentMethod: '',
  status: '',
  searchTerm: ''
};

export default function SalesPage() {
  const { selectedLocationId } = useBranch();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState(null);
  const [filters, setFilters] = useState(initialFilters);

  useEffect(() => {
    fetchSales();
  }, [selectedLocationId]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const response = await api.get('/sales');
      setSales(response.data || []);
    } catch (err) {
      console.error('Failed to fetch sales:', err);
      setSales([]);
    } finally {
      setLoading(false);
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
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="sales-page">
      <div className="page-header">
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
            <div className="col-md-3">
              <label className="form-label">Start Date</label>
              <input
                type="date"
                className="form-control"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">End Date</label>
              <input
                type="date"
                className="form-control"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Payment Method</label>
              <select
                className="form-select"
                value={filters.paymentMethod}
                onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
              >
                <option value="">All Methods</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile">Mobile Payment</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="voided">Voided</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Search</label>
              <div className="input-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Receipt #, cashier, amount"
                  value={filters.searchTerm}
                  onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                />
                <span className="input-group-text"><Search size={16} /></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-success text-white">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <h3>ETB {totalAmount.toFixed(2)}</h3>
            <p>Total Sales</p>
          </div>
        </div>

        <div className="stat-card card bg-light">
          <div className="stat-icon bg-primary text-white">
            <CreditCard size={24} />
          </div>
          <div className="stat-content">
            <h3>{filteredSales.length}</h3>
            <p>Total Transactions</p>
          </div>
        </div>

        <div className="stat-card card bg-light">
          <div className="stat-icon bg-info text-white">
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <h3>ETB {filteredSales.length > 0 ? (totalAmount / filteredSales.length).toFixed(2) : '0.00'}</h3>
            <p>Avg. Transaction</p>
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
                  <th>Payment Method</th>
                  <th>Status</th>
                  <th>Void Details</th>
                  <th>Location</th>
                  <th>Cashier</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center text-muted py-4">No sales found</td>
                  </tr>
                ) : (
                  filteredSales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{sale.receipt_number}</td>
                      <td>{formatAddisDateTime(sale.sale_date, { hour12: true })}</td>
                      <td>ETB {Number(sale.total_amount).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${sale.payment_method === 'cash' ? 'badge-success' : sale.payment_method === 'card' ? 'badge-primary' : 'badge-info'}`}>
                          {sale.payment_method}
                        </span>
                      </td>
                      <td>
                        {sale.is_offline ? (
                          <span className="badge badge-warning">Offline</span>
                        ) : (
                          <span className="badge badge-success">Online</span>
                        )}
                      </td>
                      <td>
                        {sale.status === 'voided' ? (
                          <div>
                            <small className="text-muted d-block">{formatAddisDateTime(sale.voided_at, { hour12: true })}</small>
                            <small className="text-danger">{sale.void_reason || 'No reason provided'}</small>
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td>{sale.location_name || sale.location_id}</td>
                      <td>{sale.cashier_name || sale.cashier_id}</td>
                      <td>
                        <button className="btn btn-sm btn-outline-primary" onClick={() => setSelectedSale(sale)}>
                          <Eye size={14} /> View
                        </button>
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
        <div className="modal-overlay" onClick={() => setSelectedSale(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Sale Details - {selectedSale.receipt_number}</h3>
              <button className="close-btn" onClick={() => setSelectedSale(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="row">
                <div className="col-md-6">
                  <h5>Transaction Info</h5>
                  <p><strong>Date & Time:</strong> {formatAddisDateTime(selectedSale.sale_date, { hour12: true })}</p>
                  <p><strong>Amount:</strong> ETB {Number(selectedSale.total_amount).toFixed(2)}</p>
                  <p><strong>Payment Method:</strong> {selectedSale.payment_method}</p>
                </div>
                <div className="col-md-6">
                  <h5>Staff & Location</h5>
                  <p><strong>Cashier:</strong> {selectedSale.cashier_name || selectedSale.cashier_id}</p>
                  <p><strong>Location:</strong> {selectedSale.location_name || selectedSale.location_id}</p>
                  <p><strong>Sync Status:</strong> {selectedSale.is_offline ? 'Offline' : 'Online'}</p>
                  {selectedSale.status === 'voided' && <p><strong>Void:</strong> {formatAddisDateTime(selectedSale.voided_at, { hour12: true })} — {selectedSale.void_reason || 'No reason provided'}</p>}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedSale(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
