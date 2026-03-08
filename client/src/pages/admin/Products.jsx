import { useState, useEffect, useMemo } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { enqueueOperation, listQueuedOperations } from '../../utils/offlineQueue';

const categories = [
  { id: 1, name: 'Bread' },
  { id: 2, name: 'Pastries' },
  { id: 3, name: 'Cakes' },
  { id: 4, name: 'Cookies' },
  { id: 5, name: 'Beverages' }
];

const emptyVariant = { name: '', price: '', cost: '', unit: 'piece', source: 'baked', category_id: '' };

export default function ProductsPage() {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [message, setMessage] = useState(null);
  const [search, setSearch] = useState('');
  const [groupData, setGroupData] = useState({ group_name: '', variants: [{ ...emptyVariant }] });
  const [formData, setFormData] = useState({ name: '', group_name: '', category_id: '', price: '', cost: '', unit: 'piece', source: 'baked', is_active: true });

  useEffect(() => { fetchProducts(); }, []);

  const persistProductsCache = (nextProducts) => localStorage.setItem('admin_products_cache', JSON.stringify(nextProducts));

  const applyPendingOps = async (baseProducts) => {
    const queue = await listQueuedOperations();
    const productOps = queue.filter((op) => op.url === '/products' || op.url?.startsWith('/products/'));
    let nextProducts = [...baseProducts];

    productOps.forEach((op) => {
      if (op.method === 'post' && op.url === '/products') {
        nextProducts.unshift({ id: op.id, ...op.data, is_active: true, availability_status: 'out_of_stock', is_pending_sync: true });
      }
      if (op.method === 'put' && op.url?.startsWith('/products/')) {
        const id = op.url.split('/').pop();
        nextProducts = nextProducts.map((product) => String(product.id) === String(id) ? { ...product, ...op.data, is_pending_sync: true } : product);
      }
      if (op.method === 'delete' && op.url?.startsWith('/products/')) {
        const id = op.url.split('/').pop();
        nextProducts = nextProducts.filter((product) => String(product.id) !== String(id));
      }
    });

    return nextProducts;
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await api.get('/products');
      const withPending = await applyPendingOps(response.data || []);
      setProducts(withPending);
      persistProductsCache(withPending);
    } catch (err) {
      const cached = localStorage.getItem('admin_products_cache');
      if (cached) {
        setProducts(JSON.parse(cached));
        setMessage({ type: 'warning', text: 'Offline mode: using cached products.' });
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to fetch products.') });
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setFormData({ name: '', group_name: '', category_id: '', price: '', cost: '', unit: 'piece', source: 'baked', is_active: true });
    setGroupData({ group_name: '', variants: [{ ...emptyVariant }] });
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const validVariants = groupData.variants.filter((variant) => variant.name && variant.price !== '');
      for (const variant of validVariants) {
        await api.post('/products', {
          name: variant.name,
          group_name: groupData.group_name,
          category_id: variant.category_id || null,
          price: variant.price,
          cost: variant.cost || null,
          unit: variant.unit || 'piece',
          source: variant.source || 'baked',
        });
      }
      await fetchProducts();
      resetForm();
      setMessage({ type: 'success', text: 'Product group created.' });
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to create product group.') });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.put(`/products/${editingProduct.id}`, formData);
      await fetchProducts();
      resetForm();
      setMessage({ type: 'success', text: 'Product updated.' });
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `product-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: `/products/${editingProduct.id}`, method: 'put', data: formData, idempotencyKey });
        await fetchProducts();
        resetForm();
        setMessage({ type: 'warning', text: 'Offline: product change queued for sync.' });
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to save product.') });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await api.delete(`/products/${id}`);
      await fetchProducts();
      setMessage({ type: 'success', text: 'Product deleted.' });
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `product-delete-${id}-${Date.now()}`;
        await enqueueOperation({ url: `/products/${id}`, method: 'delete', data: {}, idempotencyKey });
        setProducts((current) => {
          const nextProducts = current.filter((product) => String(product.id) !== String(id));
          persistProductsCache(nextProducts);
          return nextProducts;
        });
        setMessage({ type: 'warning', text: 'Offline: delete queued for sync.' });
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to delete product.') });
      }
    }
  };

  const groupedProducts = useMemo(() => {
    const filtered = products.filter((product) => `${product.group_name || ''} ${product.name || ''}`.toLowerCase().includes(search.toLowerCase()));
    const map = new Map();
    filtered.forEach((product) => {
      const group = product.group_name || product.name;
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(product);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products, search]);

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div className="products-page">
      <div className="page-header">
        <h2>{t('products')}</h2>
        <button className="btn btn-primary" onClick={() => { setEditingProduct(null); setShowForm(true); }}><Plus size={18} /> Add Product Group</button>
      </div>
      <div className="card mb-3"><div className="card-body"><div className="search-bar" style={{ maxWidth: '320px' }}><Search size={16}/><input className="input" placeholder="Search products..." value={search} onChange={(e)=>setSearch(e.target.value)} /></div></div></div>
      {message && <div className={`alert alert-${message.type} mb-3`}>{message.text}</div>}

      {groupedProducts.map(([groupName, variants]) => (
        <div className="card mb-3" key={groupName}><div className="card-header"><h4 className="mb-0">{groupName}</h4></div><div className="card-body"><div className="table-responsive"><table className="table table-hover"><thead><tr><th>ID</th><th>Variant</th><th>Category</th><th>Created By</th><th>Source</th><th>Price</th><th>Cost</th><th>Unit</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {variants.map((product) => <tr key={product.id}><td>{product.id}</td><td>{product.name}</td><td>{categories.find((cat) => cat.id === Number(product.category_id))?.name || product.category_name || '-'}</td><td>{product.created_by_name || '-'}</td><td><span className={`badge ${product.source === 'purchased' ? 'badge-warning' : 'badge-info'}`}>{product.source || 'baked'}</span></td><td>ETB {Number(product.price).toFixed(2)}</td><td>ETB {Number(product.cost || 0).toFixed(2)}</td><td>{product.unit}</td><td><span className={`badge ${product.is_pending_sync ? 'badge-warning' : product.availability_status === 'inactive' ? 'badge-danger' : product.availability_status === 'out_of_stock' ? 'badge-warning' : 'badge-success'}`}>{product.is_pending_sync ? 'Pending Sync' : product.availability_status === 'inactive' ? 'Inactive' : product.availability_status === 'out_of_stock' ? 'Out of stock' : 'Active'}</span></td><td><button className="btn btn-sm btn-outline-primary me-2" onClick={() => { setEditingProduct(product); setFormData({ name: product.name, group_name: product.group_name || '', category_id: product.category_id, price: product.price, cost: product.cost, unit: product.unit, source: product.source || 'baked', is_active: Boolean(product.is_active) }); setShowForm(true); }}><Edit size={14} /></button><button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(product.id)}><Trash2 size={14} /></button></td></tr>)}
        </tbody></table></div></div></div>
      ))}

      {showForm && (
        <div className="modal-overlay" onClick={resetForm}><div className="modal-content" style={{ maxWidth: '900px' }} onClick={(e) => e.stopPropagation()}><div className="modal-header"><h3>{editingProduct ? 'Edit Variant' : 'Create Product Group'}</h3><button className="close-btn" onClick={resetForm}>×</button></div>
          {!editingProduct ? (
            <form onSubmit={handleCreateGroup} className="modal-body">
              <div className="mb-3"><label className="form-label">Group Name *</label><input className="form-control" value={groupData.group_name} onChange={(e) => setGroupData({ ...groupData, group_name: e.target.value })} required /></div>
              {groupData.variants.map((variant, index) => <div className="card mb-2" key={index}><div className="card-body"><div className="row g-2"><div className="col-md-4"><label className="form-label">Variant Name *</label><input className="form-control" value={variant.name} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, name: e.target.value } : row) }))} required /></div><div className="col-md-2"><label className="form-label">Price *</label><input type="number" min="0" step="0.01" className="form-control" value={variant.price} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, price: e.target.value } : row) }))} required /></div><div className="col-md-2"><label className="form-label">Cost</label><input type="number" min="0" step="0.01" className="form-control" value={variant.cost} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, cost: e.target.value } : row) }))} /></div><div className="col-md-2"><label className="form-label">Unit</label><input className="form-control" value={variant.unit} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, unit: e.target.value } : row) }))} /></div><div className="col-md-2"><label className="form-label">Source</label><select className="form-select" value={variant.source} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, source: e.target.value } : row) }))}><option value="baked">Baked</option><option value="purchased">Purchased</option></select></div><div className="col-md-4"><label className="form-label">Category</label><select className="form-select" value={variant.category_id} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, category_id: e.target.value } : row) }))}><option value="">Select Category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></div></div></div>)}
              <div className="d-flex gap-2"><button type="button" className="btn btn-outline-secondary" onClick={() => setGroupData((prev) => ({ ...prev, variants: [...prev.variants, { ...emptyVariant }] }))}>+ Add Variant</button>{groupData.variants.length > 1 && <button type="button" className="btn btn-outline-danger" onClick={() => setGroupData((prev) => ({ ...prev, variants: prev.variants.slice(0, -1) }))}>Remove Last</button>}</div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create Group'}</button></div>
            </form>
          ) : (
            <form onSubmit={handleEditSubmit} className="modal-body">
              <div className="mb-3"><label className="form-label">Group *</label><input className="form-control" value={formData.group_name} onChange={(e) => setFormData({ ...formData, group_name: e.target.value })} required /></div>
              <div className="mb-3"><label className="form-label">Variant Name *</label><input className="form-control" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div>
              <div className="mb-3"><label className="form-label">Category *</label><select className="form-select" value={formData.category_id} onChange={(e) => setFormData({ ...formData, category_id: e.target.value })} required><option value="">Select Category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              <div className="mb-3"><label className="form-label">Source *</label><select className="form-select" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })}><option value="baked">Baked</option><option value="purchased">Purchased</option></select></div>
              <div className="row"><div className="col-md-6 mb-3"><label className="form-label">Price *</label><input type="number" min="0" step="0.01" className="form-control" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} required /></div><div className="col-md-6 mb-3"><label className="form-label">Cost</label><input type="number" min="0" step="0.01" className="form-control" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} /></div></div>
              <div className="mb-3"><label className="form-label">Unit *</label><input className="form-control" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} required /></div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Update Product'}</button></div>
            </form>
          )}
        </div></div>
      )}
    </div>
  );
}
