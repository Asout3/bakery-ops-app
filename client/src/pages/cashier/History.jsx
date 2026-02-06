import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Search, Clock, DollarSign, Receipt } from 'lucide-react';

export default function CashierHistory() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    searchTerm: ''
  });

  useEffect(() => {
    fetchSales();
  }, []);

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
    if (filters.searchTerm && 
        !sale.receipt_number.toLowerCase().includes(filters.searchTerm.toLowerCase()) &&
        !sale.total_amount.toString().includes(filters.searchTerm)) return false;
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
    <div className="sales-history-page">
      <div className="page-header">
        <h2>Sales History</h2>
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
                  <th>Date</th>
                  <th>Time</th>
                  <th>Amount</th>
                  <th>Payment Method</th>
                  <th>Items</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map(sale => (
                  <tr key={sale.id}>
                    <td>{sale.receipt_number}</td>
                    <td>{new Date(sale.sale_date).toLocaleDateString()}</td>
                    <td>{new Date(sale.sale_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      <span className="fw-bold text-success">
                        ${Number(sale.total_amount).toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${sale.payment_method === 'cash' ? 'badge-success' : sale.payment_method === 'card' ? 'badge-primary' : 'badge-info'}`}>
                        {sale.payment_method}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-secondary">
                        {sale.items?.length || 0} items
                      </span>
                    </td>
                    <td>
                      <button 
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => setSelectedSale(sale)}
                      >
                        <Receipt size={14} /> View
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
                  <p><strong>Date & Time:</strong> {new Date(selectedSale.sale_date).toLocaleString()}</p>
                  <p><strong>Amount:</strong> ${Number(selectedSale.total_amount).toFixed(2)}</p>
                  <p><strong>Payment Method:</strong> {selectedSale.payment_method}</p>
                </div>
                <div className="col-md-6">
                  <h5>Location & Staff</h5>
                  <p><strong>Location ID:</strong> {selectedSale.location_id}</p>
                  <p><strong>Cashier ID:</strong> {selectedSale.cashier_id}</p>
                </div>
              </div>
              
              <div className="mt-3">
                <h5>Items Sold</h5>
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
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedSale(null)}>Close</button>
              <button className="btn btn-primary">Print Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}