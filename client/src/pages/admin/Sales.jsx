import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Search, Plus, Eye, DollarSign, CreditCard, Calendar } from 'lucide-react';

export default function SalesPage() {
  const { selectedLocationId } = useBranch();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    paymentMethod: ''
  });

  useEffect(() => {
    fetchSales();
  }, [selectedLocationId]);

  const fetchSales = async () => {
    try {
      const response = await api.get('/sales');
      setSales(response.data);
    } catch (err) {
      console.error('Failed to fetch sales:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSales = sales.filter(sale => {
    if (filters.startDate && new Date(sale.sale_date) < new Date(filters.startDate)) return false;
    if (filters.endDate && new Date(sale.sale_date) > new Date(filters.endDate)) return false;
    if (filters.paymentMethod && sale.payment_method !== filters.paymentMethod) return false;
    return true;
  });

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
              <label className="form-label">Payment Method</label>
              <select
                className="form-select"
                value={filters.paymentMethod}
                onChange={(e) => setFilters({...filters, paymentMethod: e.target.value})}
              >
                <option value="">All Methods</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile">Mobile Payment</option>
              </select>
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
            <h3>${filteredSales.reduce((sum, sale) => sum + parseFloat(sale.total_amount || 0), 0).toFixed(2)}</h3>
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
            <h3>${filteredSales.length > 0 ? (filteredSales.reduce((sum, sale) => sum + parseFloat(sale.total_amount || 0), 0) / filteredSales.length).toFixed(2) : '0.00'}</h3>
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
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Payment Method</th>
                  <th>Location</th>
                  <th>Cashier</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map(sale => (
                  <tr key={sale.id}>
                    <td>{sale.receipt_number}</td>
                    <td>{new Date(sale.sale_date).toLocaleDateString()}</td>
                    <td>${Number(sale.total_amount).toFixed(2)}</td>
                    <td>
                      <span className={`badge ${sale.payment_method === 'cash' ? 'badge-success' : sale.payment_method === 'card' ? 'badge-primary' : 'badge-info'}`}>
                        {sale.payment_method}
                      </span>
                    </td>
                    <td>{sale.location_id}</td>
                    <td>{sale.cashier_id}</td>
                    <td>
                      <button 
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => setSelectedSale(sale)}
                      >
                        <Eye size={14} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedSale && (
        <div className="modal-overlay" onClick={() => setSelectedSale(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Sale Details - {selectedSale.receipt_number}</h3>
              <button className="close-btn" onClick={() => setSelectedSale(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="row">
                <div className="col-md-6">
                  <h5>Transaction Info</h5>
                  <p><strong>Date:</strong> {new Date(selectedSale.sale_date).toLocaleDateString()}</p>
                  <p><strong>Amount:</strong> ${Number(selectedSale.total_amount).toFixed(2)}</p>
                  <p><strong>Payment Method:</strong> {selectedSale.payment_method}</p>
                </div>
                <div className="col-md-6">
                  <h5>Staff & Location</h5>
                  <p><strong>Cashier ID:</strong> {selectedSale.cashier_id}</p>
                  <p><strong>Location ID:</strong> {selectedSale.location_id}</p>
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