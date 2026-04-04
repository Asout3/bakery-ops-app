import { useState, useEffect, useMemo } from 'react';
import './Inventory.css';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Edit, Package, TrendingUp, TrendingDown, Search } from 'lucide-react';
import { enqueueOperation, listQueuedOperations } from '../../utils/offlineQueue';

export default function AdminInventory() {
  const { selectedLocationId } = useBranch();
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [message, setMessage] = useState(null);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: ''
  });

  useEffect(() => {
    fetchData();
  }, [selectedLocationId]);


  const persistInventoryCache = (payload) => {
    localStorage.setItem(`admin_inventory_cache_${selectedLocationId || 'default'}`, JSON.stringify(payload));
  };

  const applyPendingInventoryOps = async (baseInventory) => {
    const queue = await listQueuedOperations();
    const ops = queue.filter((op) => (op.url === '/inventory' || op.url?.startsWith('/inventory/'))
      && op.status === 'pending'
      && String(op.headers?.['X-Location-Id'] || '') === String(selectedLocationId || ''));
    let nextInventory = [...baseInventory];

    ops.forEach((op) => {
      if (op.method === 'post' && op.url === '/inventory') {
        const productId = Number(op.data?.product_id);
        const existingIndex = nextInventory.findIndex((item) => Number(item.product_id) === productId);
        const projectedRow = {
          id: existingIndex >= 0 ? nextInventory[existingIndex].id : op.id,
          product_id: productId,
          location_id: Number(op.data?.location_id || selectedLocationId),
          quantity: Number(op.data?.quantity || 0),
          source: op.data?.source || 'baked',
          is_pending_sync: true,
          last_updated: new Date().toISOString(),
        };

        if (existingIndex >= 0) {
          nextInventory[existingIndex] = { ...nextInventory[existingIndex], ...projectedRow };
        } else {
          nextInventory.push(projectedRow);
        }
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
      const [inventoryRes, productsRes] = await Promise.all([
        api.get('/inventory'),
        api.get('/products')
      ]);

      const nextInventory = await applyPendingInventoryOps(inventoryRes.data || []);
      setInventory(nextInventory);
      setProducts(productsRes.data || []);
      persistInventoryCache({ inventory: nextInventory, products: productsRes.data || [] });
    } catch (err) {
      const cached = localStorage.getItem(`admin_inventory_cache_${selectedLocationId || 'default'}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setInventory(parsed.inventory || []);
        setProducts(parsed.products || []);
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
    setFormData({ product_id: '', quantity: '', source: 'baked' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    const payload = {
      product_id: Number(formData.product_id),
      location_id: Number(selectedLocationId),
      quantity: Number(formData.quantity),
      source: formData.source || 'baked',
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

  const availableProductsForCreate = products.filter((product) => {
    if (editingItem) {
      return true;
    }
    return product.is_active !== false && !inventory.some((item) => Number(item.product_id) === Number(product.id));
  });


  const inventoryRows = useMemo(() => products
    .filter((product) => product.is_active !== false)
    .map((product) => {
      const row = inventory.find((item) => Number(item.product_id) === Number(product.id));
      return {
        item: row || {
          id: `virtual-${product.id}`,
          product_id: product.id,
          quantity: 0,
          source: product.source || 'baked',
          last_updated: null,
          is_virtual: true,
        },
        product,
      };
    }), [products, inventory]);

  const getLowStockThreshold = (product) => {
    const productThreshold = Number(product?.low_stock_threshold);
    if (Number.isFinite(productThreshold) && productThreshold >= 0) return productThreshold;
    return 5;
  };

  const outOfStockCount = useMemo(() => inventoryRows
    .filter(({ item }) => Number(item.quantity || 0) <= 0)
    .length, [inventoryRows]);

  const lowStockCount = useMemo(() => inventoryRows
    .filter(({ item, product }) => {
      const qty = Number(item.quantity || 0);
      const threshold = getLowStockThreshold(product);
      return qty > 0 && qty <= threshold;
    })
    .length, [inventoryRows]);


  const totalStockUnits = useMemo(() => inventoryRows
    .reduce((sum, { item }) => sum + Number(item.quantity || 0), 0), [inventoryRows]);

  const inStockCount = useMemo(() => inventoryRows
    .filter(({ item }) => Number(item.quantity || 0) > 0)
    .length, [inventoryRows]);

  const filteredInventory = inventoryRows.filter(({ item, product }) => {
    const text = `${product?.group_name || product?.name || ''} ${product?.name || ''}`.toLowerCase();
    if (!text.includes(search.toLowerCase())) return false;

    const qty = Number(item.quantity || 0);
    const threshold = getLowStockThreshold(product);
    if (stockFilter === 'low') return qty > 0 && qty <= threshold;
    if (stockFilter === 'out') return qty <= 0;
    if (stockFilter === 'well') return qty > threshold;
    return true;
  });

  const groupedInventory = filteredInventory.reduce((acc, row) => {
    const group = row.product?.group_name || row.product?.name || 'Ungrouped';
    if (!acc[group]) acc[group] = [];
    acc[group].push(row);
    return acc;
  }, {});

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h2>Inventory Management</h2>
      </div>

      {message && <div className={`alert alert-${message.type} mb-3`}>{message.text}</div>}

      <div className="card mb-3"><div className="card-body" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar" style={{ maxWidth: '320px' }}><Search size={16}/><input className="input" placeholder="Search inventory by product..." value={search} onChange={(e)=>setSearch(e.target.value)} /></div>
        <div className="btn-group" role="group">
          <button type="button" className={`btn btn-sm ${stockFilter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setStockFilter('all')}>All</button>
          <button type="button" className={`btn btn-sm ${stockFilter === 'well' ? 'btn-success' : 'btn-outline-success'}`} onClick={() => setStockFilter('well')}>Well Stocked</button>
          <button type="button" className={`btn btn-sm ${stockFilter === 'low' ? 'btn-warning' : 'btn-outline-warning'}`} onClick={() => setStockFilter('low')}>Low Stock</button>
          <button type="button" className={`btn btn-sm ${stockFilter === 'out' ? 'btn-danger' : 'btn-outline-danger'}`} onClick={() => setStockFilter('out')}>Out of Stock</button>
        </div>
      </div></div>


      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light"><div className="stat-icon bg-primary text-white"><Package size={24} /></div><div className="stat-content"><h3>{totalStockUnits}</h3><p>Total Items</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-success text-white"><TrendingUp size={24} /></div><div className="stat-content"><h3>{inStockCount}</h3><p>In Stock</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-warning text-white"><TrendingDown size={24} /></div><div className="stat-content"><h3>{lowStockCount}</h3><p>Low Stock</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-danger text-white"><TrendingDown size={24} /></div><div className="stat-content"><h3>{outOfStockCount}</h3><p>Out of Stock</p></div></div>
      </div>

      {Object.keys(groupedInventory).sort((a, b) => a.localeCompare(b)).map((group) => (
        <div className="card mb-3" key={group}><div className="card-header"><h4 className="mb-0">{group}</h4></div><div className="card-body"><div className="table-responsive"><table className="table table-hover"><thead><tr><th>Inventory ID</th><th>Variant</th><th>Quantity</th><th>Last Updated</th><th>Source</th><th>Actions</th></tr></thead><tbody>
          {groupedInventory[group].map(({ item, product }) => (
            <tr key={item.id}>
              <td>{`INV-${String(item.id).padStart(6, '0')}`}</td>
              <td>{product?.name || item.product_id}{product?.is_active === false && <span className="badge badge-warning ms-2">Archived</span>}</td>
              <td><span className={`badge ${Number(item.quantity) <= getLowStockThreshold(product) ? 'badge-warning' : 'badge-success'}`}>{item.quantity}</span>{item.is_pending_sync && <span className="badge badge-info" style={{ marginLeft: '0.4rem' }}>Pending Sync</span>}</td>
              <td>{item.last_updated ? new Date(item.last_updated).toLocaleDateString() : '—'}</td>
              <td><span className={`badge ${item.source === 'baked' ? 'badge-info' : 'badge-secondary'}`}>{item.source}</span></td>
              <td><div className="btn-group" role="group">
                <button className="btn btn-sm btn-outline-primary" onClick={() => { setEditingItem(item); setFormData({ product_id: item.product_id, quantity: item.quantity, source: item.source || 'baked' }); setShowForm(true); }}><Edit size={14} /></button>
              </div></td>
            </tr>
          ))}
        </tbody></table></div></div></div>
      ))}

      {showForm && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Edit Inventory Item</h3><button className="close-btn" onClick={resetForm}>×</button></div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="mb-3"><label className="form-label">Product *</label><select className="form-select" value={formData.product_id} onChange={(e) => setFormData({ ...formData, product_id: e.target.value })} required disabled={!!editingItem}><option value="">Select Product Variant</option>{availableProductsForCreate.map((product) => (<option key={product.id} value={product.id}>{`${product.group_name || product.name} / ${product.name}`}</option>))}</select>{editingItem && <small className="text-muted">Product cannot be changed when editing inventory. Only quantity is editable.</small>}</div>
              <div className="mb-3"><label className="form-label">Quantity *</label><input type="number" className="form-control" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} required /></div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Update'} Item</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
