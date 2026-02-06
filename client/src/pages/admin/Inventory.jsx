import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Search, Plus, Edit, Trash2, Package, TrendingUp, TrendingDown } from 'lucide-react';

export default function AdminInventory() {
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    product_id: '',
    location_id: '',
    quantity: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [inventoryRes, productsRes, locationsRes] = await Promise.all([
        api.get('/inventory'),
        api.get('/products'),
        api.get('/locations')
      ]);
      
      setInventory(inventoryRes.data);
      setProducts(productsRes.data);
      setLocations(locationsRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await api.put(`/inventory/${editingItem.id}`, formData);
      } else {
        await api.post('/inventory', formData);
      }
      fetchData();
      setShowForm(false);
      setEditingItem(null);
      setFormData({ product_id: '', location_id: '', quantity: '' });
    } catch (err) {
      console.error('Failed to save inventory:', err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this inventory item?')) {
      try {
        await api.delete(`/inventory/${id}`);
        fetchData();
      } catch (err) {
        console.error('Failed to delete inventory:', err);
      }
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
    <div className="inventory-page">
      <div className="page-header">
        <h2>Inventory Management</h2>
        <button 
          className="btn btn-primary" 
          onClick={() => {
            setEditingItem(null);
            setFormData({ product_id: '', location_id: '', quantity: '' });
            setShowForm(true);
          }}
        >
          <Plus size={18} /> Add Item
        </button>
      </div>

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-primary text-white">
            <Package size={24} />
          </div>
          <div className="stat-content">
            <h3>{inventory.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0)}</h3>
            <p>Total Items</p>
          </div>
        </div>
        
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-success text-white">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <h3>{inventory.filter(item => parseInt(item.quantity || 0) > 10).length}</h3>
            <p>In Stock</p>
          </div>
        </div>
        
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-warning text-white">
            <TrendingDown size={24} />
          </div>
          <div className="stat-content">
            <h3>{inventory.filter(item => parseInt(item.quantity || 0) <= 5).length}</h3>
            <p>Low Stock</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Product</th>
                  <th>Location</th>
                  <th>Quantity</th>
                  <th>Last Updated</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{products.find(p => p.id === item.product_id)?.name || item.product_id}</td>
                    <td>{locations.find(l => l.id === item.location_id)?.name || item.location_id}</td>
                    <td>
                      <span className={`badge ${parseInt(item.quantity) <= 5 ? 'badge-warning' : 'badge-success'}`}>
                        {item.quantity}
                      </span>
                    </td>
                    <td>{new Date(item.last_updated).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${item.source === 'baked' ? 'badge-info' : 'badge-secondary'}`}>
                        {item.source}
                      </span>
                    </td>
                    <td>
                      <button 
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => {
                          setEditingItem(item);
                          setFormData({
                            product_id: item.product_id,
                            location_id: item.location_id,
                            quantity: item.quantity
                          });
                          setShowForm(true);
                        }}
                      >
                        <Edit size={14} />
                      </button>
                      <button 
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingItem ? 'Edit Inventory Item' : 'Add New Inventory Item'}</h3>
              <button className="close-btn" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="mb-3">
                <label className="form-label">Product *</label>
                <select
                  className="form-select"
                  value={formData.product_id}
                  onChange={(e) => setFormData({...formData, product_id: e.target.value})}
                  required
                >
                  <option value="">Select Product</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="mb-3">
                <label className="form-label">Location *</label>
                <select
                  className="form-select"
                  value={formData.location_id}
                  onChange={(e) => setFormData({...formData, location_id: e.target.value})}
                  required
                >
                  <option value="">Select Location</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="mb-3">
                <label className="form-label">Quantity *</label>
                <input
                  type="number"
                  className="form-control"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  required
                />
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingItem ? 'Update' : 'Add'} Item</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}