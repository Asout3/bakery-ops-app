import { useState, useEffect, useMemo } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { enqueueOperation, listQueuedOperations } from '../../utils/offlineQueue';

export default function ProductsPage() {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [message, setMessage] = useState(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    price: '',
    cost: '',
    unit: 'piece',
    source: 'baked',
    is_active: true,
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const persistProductsCache = (nextProducts) => {
    localStorage.setItem('admin_products_cache', JSON.stringify(nextProducts));
  };

  const applyPendingOps = async (baseProducts) => {
    const queue = await listQueuedOperations();
    const productOps = queue.filter((op) => op.url === '/products' || op.url?.startsWith('/products/'));
    let nextProducts = [...baseProducts];

    productOps.forEach((op) => {
      if (op.method === 'post' && op.url === '/products') {
        nextProducts.unshift({
          id: op.id,
          name: op.data?.name,
          category_id: Number(op.data?.category_id) || null,
          price: Number(op.data?.price || 0),
          cost: Number(op.data?.cost || 0),
          unit: op.data?.unit || 'piece',
          source: op.data?.source || 'baked',
          is_active: true,
          availability_status: 'out_of_stock',
          is_pending_sync: true,
        });
      }
      if (op.method === 'put' && op.url?.startsWith('/products/')) {
        const id = op.url.split('/').pop();
        nextProducts = nextProducts.map((product) => String(product.id) === String(id)
          ? { ...product, ...op.data, is_pending_sync: true }
          : product);
      }
      if (op.method === 'delete' && op.url?.startsWith('/products/')) {
        const id = op.url.split('/').pop();
        nextProducts = nextProducts.filter((product) => String(product.id) !== String(id));
      }
    });

    return nextProducts;
  };

  const fetchProducts = async () => {
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
    setFormData({ name: '', category_id: '', price: '', cost: '', unit: 'piece', source: 'baked', is_active: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, formData);
      } else {
        await api.post('/products', formData);
      }
      await fetchProducts();
      resetForm();
      setMessage({ type: 'success', text: editingProduct ? 'Product updated.' : 'Product created.' });
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `product-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const op = editingProduct
          ? { url: `/products/${editingProduct.id}`, method: 'put', data: formData, idempotencyKey }
          : { id: idempotencyKey, url: '/products', method: 'post', data: formData, idempotencyKey };
        await enqueueOperation(op);
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

  const categories = [
    { id: 1, name: 'Bread' },
    { id: 2, name: 'Pastries' },
    { id: 3, name: 'Cakes' },
    { id: 4, name: 'Cookies' },
    { id: 5, name: 'Beverages' }
  ];

  const filteredProducts = useMemo(() => products
    .filter((product) => product.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aActive = a.availability_status !== 'inactive' && a.is_active !== false;
      const bActive = b.availability_status !== 'inactive' && b.is_active !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    }), [products, search]);

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div className="products-page">
      <div className="page-header">
        <h2>{t('products')}</h2>
        <button className="btn btn-primary" onClick={() => { setEditingProduct(null); resetForm(); setShowForm(true); }}>
          <Plus size={18} /> {t('addProduct')}
        </button>
      </div>

      <div className="card mb-3"><div className="card-body">
        <div className="search-bar" style={{ maxWidth: '320px' }}><Search size={16}/><input className="input" placeholder="Search products..." value={search} onChange={(e)=>setSearch(e.target.value)} /></div>
      </div></div>

      {message && <div className={`alert alert-${message.type} mb-3`}>{message.text}</div>}

      <div className="card"><div className="card-body"><div className="table-responsive"><table className="table table-hover"><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Source</th><th>Price</th><th>Cost</th><th>Unit</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {filteredProducts.map((product) => (
          <tr key={product.id}>
            <td>{product.id}</td>
            <td>{product.name}</td>
            <td>{categories.find((cat) => cat.id === Number(product.category_id))?.name || product.category_id}</td>
            <td><span className={`badge ${product.source === 'purchased' ? 'badge-warning' : 'badge-info'}`}>{product.source || 'baked'}</span></td>
            <td>ETB {Number(product.price).toFixed(2)}</td>
            <td>ETB {Number(product.cost || 0).toFixed(2)}</td>
            <td>{product.unit}</td>
            <td>
              <span className={`badge ${product.is_pending_sync ? 'badge-warning' : product.availability_status === 'inactive' ? 'badge-danger' : product.availability_status === 'out_of_stock' ? 'badge-warning' : 'badge-success'}`}>
                {product.is_pending_sync ? 'Pending Sync' : product.availability_status === 'inactive' ? 'Inactive' : product.availability_status === 'out_of_stock' ? 'Out of stock' : 'Active'}
              </span>
            </td>
            <td>
              <button className="btn btn-sm btn-outline-primary me-2" onClick={() => { setEditingProduct(product); setFormData({ name: product.name, category_id: product.category_id, price: product.price, cost: product.cost, unit: product.unit, source: product.source || 'baked', is_active: Boolean(product.is_active) }); setShowForm(true); }}><Edit size={14} /></button>
              <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(product.id)}><Trash2 size={14} /></button>
            </td>
          </tr>
        ))}
      </tbody></table></div></div></div>

      {showForm && (
        <div className="modal-overlay" onClick={resetForm}><div className="modal-content" onClick={(e) => e.stopPropagation()}><div className="modal-header"><h3>{editingProduct ? 'Edit Product' : 'Add New Product'}</h3><button className="close-btn" onClick={resetForm}>×</button></div>
          <form onSubmit={handleSubmit} className="modal-body">
            <div className="mb-3"><label className="form-label">Name *</label><input type="text" className="form-control" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div>
            <div className="mb-3"><label className="form-label">Category *</label><select className="form-select" value={formData.category_id} onChange={(e) => setFormData({ ...formData, category_id: e.target.value })} required><option value="">Select Category</option>{categories.map((category) => (<option key={category.id} value={category.id}>{category.name}</option>))}</select></div>
            <div className="mb-3"><label className="form-label">Product Source *</label><select className="form-select" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} required><option value="baked">Baked</option><option value="purchased">Purchased</option></select></div>
            <div className="row"><div className="col-md-6 mb-3"><label className="form-label">Price *</label><input type="number" step="0.01" className="form-control" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} required /></div><div className="col-md-6 mb-3"><label className="form-label">Cost</label><input type="number" step="0.01" className="form-control" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} /></div></div>
            <div className="mb-3"><label className="form-label">Unit</label><select className="form-select" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })}><option value="piece">Piece</option><option value="kg">Kilogram</option><option value="lb">Pound</option><option value="dozen">Dozen</option></select></div>
            <div className="mb-3"><label className="form-label"><input type="checkbox" checked={!!formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} /> Active</label></div>
            <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editingProduct ? 'Update' : 'Create'} Product</button></div>
          </form>
        </div></div>
      )}
    </div>
  );
}
