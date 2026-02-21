import { useState, useEffect } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Plus, Edit, Trash2, Package, TrendingUp, TrendingDown } from 'lucide-react';
import { enqueueOperation, listQueuedOperations } from '../../utils/offlineQueue';

export default function AdminInventory() {
  const { selectedLocationId } = useBranch();
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [message, setMessage] = useState(null);
  const [formData, setFormData] = useState({
    product_id: '',
    location_id: '',
    quantity: '',
    source: 'baked'
  });

  useEffect(() => {
    fetchData();
  }, [selectedLocationId]);

  const persistInventoryCache = (payload) => {
    localStorage.setItem(`admin_inventory_cache_${selectedLocationId || 'default'}`, JSON.stringify(payload));
  };

  const applyPendingInventoryOps = async (baseInventory) => {
    const queue = await listQueuedOperations();
    const ops = queue.filter((op) => op.url === '/inventory' || op.url?.startsWith('/inventory/'));
    let nextInventory = [...baseInventory];

    ops.forEach((op) => {
      if (op.method === 'post' && op.url === '/inventory') {
        nextInventory.push({
          id: op.id,
          product_id: Number(op.data?.product_id),
          location_id: Number(op.data?.location_id || selectedLocationId),
          quantity: Number(op.data?.quantity || 0),
          source: op.data?.source || 'baked',
          is_pending_sync: true,
          last_updated: new Date().toISOString(),
        });
      }

      if (op.method === 'put' && op.url?.startsWith('/inventory/')) {
        const id = op.url.split('/').pop();
        nextInventory = nextInventory.map((item) => String(item.product_id) === String(id)
          ? {
              ...item,
              quantity: Number(op.data?.quantity || item.quantity),
              source: op.data?.source || item.source,
              is_pending_sync: true,
              last_updated: new Date().toISOString(),
            }
          : item);
      }

      if (op.method === 'delete' && op.url?.startsWith('/inventory/')) {
        const id = op.url.split('/').pop();
        nextInventory = nextInventory.filter((item) => String(item.id) !== String(id) && String(item.product_id) !== String(id));
      }
    });

    return nextInventory;
  };

  const fetchData = async () => {
    try {
      const [inventoryRes, productsRes, locationsRes] = await Promise.all([
        api.get('/inventory'),
        api.get('/products'),
        api.get('/locations')
      ]);

      const nextInventory = await applyPendingInventoryOps(inventoryRes.data || []);
      setInventory(nextInventory);
      setProducts(productsRes.data || []);
      setLocations(locationsRes.data || []);
      persistInventoryCache({ inventory: nextInventory, products: productsRes.data || [], locations: locationsRes.data || [] });
    } catch (err) {
      const cached = localStorage.getItem(`admin_inventory_cache_${selectedLocationId || 'default'}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setInventory(parsed.inventory || []);
        setProducts(parsed.products || []);
        setLocations(parsed.locations || []);
        setMessage({ type: 'warning', text: 'Offline mode: using cached inventory.' });
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to fetch inventory data.') });
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setFormData({ product_id: '', location_id: '', quantity: '', source: 'baked' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    const payload = {
      product_id: Number(formData.product_id),
      location_id: Number(formData.location_id || selectedLocationId),
      quantity: Number(formData.quantity),
      source: formData.source,
    };

    try {
      if (editingItem) {
        await api.put(`/inventory/${editingItem.product_id}`, { quantity: payload.quantity, source: payload.source });
      } else {
        await api.post('/inventory', payload);
      }
      await fetchData();
      resetForm();
      setMessage({ type: 'success', text: editingItem ? 'Inventory updated.' : 'Inventory added.' });
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `inventory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const op = editingItem
          ? { url: `/inventory/${editingItem.product_id}`, method: 'put', data: { quantity: payload.quantity, source: payload.source }, idempotencyKey }
          : { id: idempotencyKey, url: '/inventory', method: 'post', data: payload, idempotencyKey };
        await enqueueOperation(op);
        await fetchData();
        resetForm();
        setMessage({ type: 'warning', text: 'Offline: inventory change queued for sync.' });
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to save inventory item.') });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this inventory item?')) return;

    try {
      await api.delete(`/inventory/${id}`);
      await fetchData();
      setMessage({ type: 'success', text: 'Inventory item deleted.' });
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `inventory-delete-${id}-${Date.now()}`;
        await enqueueOperation({ url: `/inventory/${id}`, method: 'delete', data: {}, idempotencyKey });
        setInventory((current) => {
          const nextInventory = current.filter((item) => String(item.id) !== String(id));
          persistInventoryCache({ inventory: nextInventory, products, locations });
          return nextInventory;
        });
        setMessage({ type: 'warning', text: 'Offline: delete queued for sync.' });
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to delete inventory item.') });
      }
    }
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h2>Inventory Management</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingItem(null);
            setFormData({ product_id: '', location_id: '', quantity: '', source: 'baked' });
            setShowForm(true);
          }}
        >
          <Plus size={18} /> Add Item
        </button>
      </div>

      {message && <div className={`alert alert-${message.type} mb-3`}>{message.text}</div>}

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light"><div className="stat-icon bg-primary text-white"><Package size={24} /></div><div className="stat-content"><h3>{inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</h3><p>Total Items</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-success text-white"><TrendingUp size={24} /></div><div className="stat-content"><h3>{inventory.filter((item) => Number(item.quantity || 0) > 10).length}</h3><p>In Stock</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-warning text-white"><TrendingDown size={24} /></div><div className="stat-content"><h3>{inventory.filter((item) => Number(item.quantity || 0) <= 5).length}</h3><p>Low Stock</p></div></div>
      </div>

      <div className="card"><div className="card-body"><div className="table-responsive"><table className="table table-hover"><thead><tr><th>ID</th><th>Product</th><th>Location</th><th>Quantity</th><th>Last Updated</th><th>Source</th><th>Actions</th></tr></thead><tbody>
        {inventory.map((item) => (
          <tr key={item.id}>
            <td>{item.id}</td>
            <td>{products.find((p) => p.id === item.product_id)?.name || item.product_id}</td>
            <td>{locations.find((l) => l.id === item.location_id)?.name || item.location_id}</td>
            <td><span className={`badge ${Number(item.quantity) <= 5 ? 'badge-warning' : 'badge-success'}`}>{item.quantity}</span>{item.is_pending_sync && <span className="badge badge-info" style={{ marginLeft: '0.4rem' }}>Pending Sync</span>}</td>
            <td>{new Date(item.last_updated).toLocaleDateString()}</td>
            <td><span className={`badge ${item.source === 'baked' ? 'badge-info' : 'badge-secondary'}`}>{item.source}</span></td>
            <td>
              <button className="btn btn-sm btn-outline-primary me-2" onClick={() => { setEditingItem(item); setFormData({ product_id: item.product_id, location_id: item.location_id, quantity: item.quantity, source: item.source || 'baked' }); setShowForm(true); }}><Edit size={14} /></button>
              <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(item.id)}><Trash2 size={14} /></button>
            </td>
          </tr>
        ))}
      </tbody></table></div></div></div>

      {showForm && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingItem ? 'Edit Inventory Item' : 'Add New Inventory Item'}</h3><button className="close-btn" onClick={resetForm}>×</button></div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="mb-3"><label className="form-label">Product *</label><select className="form-select" value={formData.product_id} onChange={(e) => setFormData({ ...formData, product_id: e.target.value })} required><option value="">Select Product</option>{products.map((product) => (<option key={product.id} value={product.id}>{product.name}</option>))}</select></div>
              <div className="mb-3"><label className="form-label">Location *</label><select className="form-select" value={formData.location_id} onChange={(e) => setFormData({ ...formData, location_id: e.target.value })} required><option value="">Select Location</option>{locations.map((location) => (<option key={location.id} value={location.id}>{location.name}</option>))}</select></div>
              <div className="mb-3"><label className="form-label">Quantity *</label><input type="number" className="form-control" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} required /></div>
              <div className="mb-3"><label className="form-label">Source *</label><select className="form-select" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} required><option value="baked">Baked</option><option value="purchased">Purchased</option></select></div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editingItem ? 'Update' : 'Add'} Item</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
