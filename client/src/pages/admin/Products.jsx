import { useState, useEffect, useMemo } from 'react';
import './Products.css';
import api, { getErrorMessage } from '../../api/axios';
import { Plus, Edit, Trash2, Search, Pencil } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';

const UNIT_OPTIONS = ['piece', 'kg', 'gram', 'liter', 'pack', 'tray'];
const emptyVariant = { name: '', price: '', cost: '', unit: 'piece', source: 'baked', category_id: '', low_stock_threshold: '', shelf_life_days: '' };
const formatProductDisplayId = (product) => {
  const group = (product.group_name || product.name || 'PRD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PRD';
  return `${group}-${String(product.id).padStart(4, '0')}`;
};


const productsControlsCardStyle = { border: '1px solid var(--border-light)' };

const productsControlsRowStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, auto)',
  gap: '0.75rem',
  alignItems: 'center',
};

export default function ProductsPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [message, setMessage] = useState(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [groupRename, setGroupRename] = useState({ name: '', next: '' });
  const [groupData, setGroupData] = useState({ group_name: '', variants: [{ ...emptyVariant }] });
  const [variantData, setVariantData] = useState({ ...emptyVariant, group_name: '' });
  const [formData, setFormData] = useState({ name: '', group_name: '', category_id: '', price: '', cost: '', unit: 'piece', source: 'baked', low_stock_threshold: '', shelf_life_days: '', is_active: true });

  const hasMandatoryFields = (variant) => (
    variant.low_stock_threshold !== ''
    && variant.shelf_life_days !== ''
    && Number(variant.shelf_life_days) >= 1
    && Number(variant.low_stock_threshold) >= 0
  );

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);


  const fetchCategories = async () => {
    try {
      const response = await api.get('/products/categories');
      setCategories(response.data || []);
    } catch (err) {
      setMessage({ type: 'warning', text: getErrorMessage(err, 'Failed to load categories.') });
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await api.get('/products');
      setProducts(response.data || []);
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to fetch products.') });
    } finally {
      setLoading(false);
    }
  };

  const resetForms = () => {
    setShowGroupForm(false);
    setShowVariantForm(false);
    setEditingProduct(null);
    setFormData({ name: '', group_name: '', category_id: '', price: '', cost: '', unit: 'piece', source: 'baked', low_stock_threshold: '', shelf_life_days: '', is_active: true });
    setGroupData({ group_name: '', variants: [{ ...emptyVariant }] });
    setVariantData({ ...emptyVariant, group_name: '' });
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const response = await api.post('/products/categories', { name: newCategoryName.trim() });
      setCategories((current) => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName('');
      setMessage({ type: 'success', text: t('categoryAdded') });
      toast.success(t('categoryAdded'));
    } catch (err) {
      const errorMessage = getErrorMessage(err, 'Failed to add category.');
      setMessage({ type: 'danger', text: errorMessage });
      toast.error(errorMessage);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const validVariants = groupData.variants.filter((variant) => variant.name && variant.price !== '');
      if (!validVariants.length) {
        setMessage({ type: 'warning', text: 'Add at least one variant.' });
        setSaving(false);
        return;
      }
      if (!validVariants.every(hasMandatoryFields)) {
        setMessage({ type: 'warning', text: 'Low stock threshold and shelf life (>=1 day) are required for every variant.' });
        setSaving(false);
        return;
      }
      for (const variant of validVariants) {
        await api.post('/products', {
          name: variant.name,
          group_name: groupData.group_name,
          category_id: variant.category_id || null,
          price: variant.price,
          cost: variant.cost || null,
          unit: variant.unit || 'piece',
          source: variant.source || 'baked',
          low_stock_threshold: variant.low_stock_threshold !== '' ? Number(variant.low_stock_threshold) : null,
          shelf_life_days: variant.shelf_life_days !== '' ? Number(variant.shelf_life_days) : null,
        });
      }
      await fetchProducts();
      resetForms();
      setMessage({ type: 'success', text: 'Product group created.' });
      toast.success('Product group created.');
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to create product group.') });
      toast.error(getErrorMessage(err, 'Failed to create product group.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateVariant = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (!hasMandatoryFields(variantData)) {
        setMessage({ type: 'warning', text: 'Low stock threshold and shelf life (>=1 day) are required.' });
        setSaving(false);
        return;
      }
      await api.post('/products', {
        name: variantData.name,
        group_name: variantData.group_name,
        category_id: variantData.category_id || null,
        price: variantData.price,
        cost: variantData.cost || null,
        unit: variantData.unit || 'piece',
        source: variantData.source || 'baked',
        low_stock_threshold: variantData.low_stock_threshold !== '' ? Number(variantData.low_stock_threshold) : null,
        shelf_life_days: variantData.shelf_life_days !== '' ? Number(variantData.shelf_life_days) : null,
      });
      await fetchProducts();
      resetForms();
      setMessage({ type: 'success', text: 'Variant added to group.' });
      toast.success('Variant added.');
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to add variant.') });
      toast.error(getErrorMessage(err, 'Failed to add variant.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = { ...formData, low_stock_threshold: formData.low_stock_threshold !== '' ? Number(formData.low_stock_threshold) : null, shelf_life_days: formData.shelf_life_days !== '' ? Number(formData.shelf_life_days) : null };
      await api.put(`/products/${editingProduct.id}`, payload);
      await fetchProducts();
      resetForms();
      setMessage({ type: 'success', text: 'Variant updated.' });
      toast.success('Variant updated.');
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to save product.') });
      toast.error(getErrorMessage(err, 'Failed to save product.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('deleteVariantConfirm'))) return;
    try {
      await api.delete(`/products/${id}`);
      await fetchProducts();
      setMessage({ type: 'success', text: 'Variant deleted.' });
      toast.success('Variant deleted.');
    } catch (err) {
      if (err?.response?.data?.code === 'PRODUCT_DELETE_BLOCKED') {
        await api.put(`/products/${id}`, { is_active: false });
        await fetchProducts();
        setMessage({ type: 'warning', text: 'Variant archived because it has linked history.' });
        toast.warning('Variant archived because it has linked history.');
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to delete variant.') });
        toast.error(getErrorMessage(err, 'Failed to delete variant.'));
      }
    }
  };

  const handleRenameGroup = async (groupName) => {
    const nextName = groupRename.next.trim();
    if (!nextName) return;
    if (nextName.toLowerCase() === groupName.toLowerCase()) {
      setGroupRename({ name: '', next: '' });
      return;
    }

    const variants = products.filter((product) => (product.group_name || product.name) === groupName);
    if (!variants.length) return;

    setSaving(true);
    try {
      await Promise.all(variants.map((variant) => api.put(`/products/${variant.id}`, { group_name: nextName })));
      await fetchProducts();
      setGroupRename({ name: '', next: '' });
      setMessage({ type: 'success', text: `Group renamed to ${nextName}.` });
      toast.success(`Group renamed to ${nextName}.`);
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to rename group.') });
      toast.error(getErrorMessage(err, 'Failed to rename group.'));
    } finally {
      setSaving(false);
    }
  };

  const groupedProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchesText = `${product.group_name || ''} ${product.name || ''}`.toLowerCase().includes(search.toLowerCase());
      const visibleByArchive = showArchived ? true : product.is_active !== false;
      return matchesText && visibleByArchive;
    });
    const map = new Map();
    filtered.forEach((product) => {
      const group = product.group_name || product.name;
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(product);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products, search, showArchived]);

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div className="products-page">
      <div className="page-header" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2>{t('products')}</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-secondary" onClick={() => setShowArchived((p) => !p)}>{showArchived ? t('hideArchived') : t('seeArchivedProducts')}</button>
          <button className="btn btn-primary" onClick={() => { resetForms(); setShowGroupForm(true); }}><Plus size={18} /> {t('addProductGroup')}</button>
        </div>
      </div>

      <div className="card mb-3" style={productsControlsCardStyle}>
        <div className="card-body" style={productsControlsRowStyle}>
          <div>
            <label className="form-label mb-1">{t('searchProducts')}</label>
            <div className="search-bar" style={{ maxWidth: '100%' }}>
              <Search size={16} />
              <input className="input" placeholder={t('searchGroupsOrVariants')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label mb-1">{t('addCategory')}</label>
            <div className="d-flex gap-2" style={{ minWidth: '320px' }}>
              <input className="form-control" placeholder="New category" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
              <button className="btn btn-outline-primary" onClick={handleCreateCategory}>{t('addCategory')}</button>
            </div>
          </div>
        </div>
      </div>

      {message && <div className={`alert alert-${message.type} mb-3`}>{message.text}</div>}

      {groupedProducts.map(([groupName, variants]) => (
        <div className="card mb-3" key={groupName}>
          <div className="card-header d-flex justify-content-between align-items-center" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
            {groupRename.name === groupName ? (
              <div className="d-flex gap-2" style={{ flex: 1, maxWidth: '520px' }}>
                <input className="form-control form-control-sm" value={groupRename.next} onChange={(e) => setGroupRename((prev) => ({ ...prev, next: e.target.value }))} />
                <button className="btn btn-sm btn-primary" onClick={() => handleRenameGroup(groupName)} disabled={saving}>Save</button>
                <button className="btn btn-sm btn-secondary" onClick={() => setGroupRename({ name: '', next: '' })}>Cancel</button>
              </div>
            ) : (
              <h4 className="mb-0">{groupName}</h4>
            )}
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setGroupRename({ name: groupName, next: groupName })}><Pencil size={14} /> Rename Group</button>
              <button className="btn btn-sm btn-outline-primary" onClick={() => { setVariantData({ ...emptyVariant, group_name: groupName, category_id: variants[0]?.category_id || '' }); setShowVariantForm(true); }}>+ Add Variant</button>
            </div>
          </div>
          <div className="card-body"><div className="table-responsive"><table className="table table-hover"><thead><tr><th>ID</th><th>Variant</th><th>Category</th><th>Source</th><th>Price</th><th>Cost</th><th>Unit</th><th>Shelf Life</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            {variants.map((product) => (
              <tr key={product.id}>
                <td>{formatProductDisplayId(product)}</td>
                <td>{product.name}</td>
                <td>{product.category_name || categories.find((c) => Number(c.id) === Number(product.category_id))?.name || '-'}</td>
                <td><span className={`badge ${product.source === 'purchased' ? 'badge-warning' : 'badge-info'}`}>{product.source || 'baked'}</span></td>
                <td>ETB {Number(product.price || 0).toFixed(2)}</td>
                <td>ETB {Number(product.cost || 0).toFixed(2)}</td>
                <td>{product.unit}</td>
                <td>{product.shelf_life_days !== null && product.shelf_life_days !== undefined ? `${product.shelf_life_days} day(s)` : 'No shelf life'}</td>
                <td><span className={`badge ${product.is_active === false ? 'badge-danger' : product.is_expired ? 'badge-warning' : 'badge-success'}`}>{product.is_active === false ? 'Inactive' : product.is_expired ? 'Expired' : 'Active'}</span></td>
                <td>
                  <button className="btn btn-sm btn-outline-primary me-2" onClick={() => { setEditingProduct(product); setFormData({ name: product.name, group_name: product.group_name || groupName, category_id: product.category_id || '', price: product.price, cost: product.cost || '', unit: product.unit || 'piece', source: product.source || 'baked', low_stock_threshold: product.low_stock_threshold ?? '', shelf_life_days: product.shelf_life_days ?? '', is_active: Boolean(product.is_active) }); }}><Edit size={14} /></button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(product.id)} title="Delete or Archive"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody></table></div></div>
        </div>
      ))}

      {(showGroupForm || showVariantForm || editingProduct) && (
        <div className="modal-overlay" onClick={resetForms}>
          <div className="modal-content" style={{ maxWidth: '1200px', width: '95vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>{showGroupForm ? 'Create Product Group' : showVariantForm ? `Add Variant to ${variantData.group_name}` : 'Edit Variant'}</h3><button className="close-btn" onClick={resetForms}>×</button></div>
            {showGroupForm && (
              <form onSubmit={handleCreateGroup} className="modal-body">
                <div className="mb-3"><label className="form-label">Group Name *</label><input className="form-control" value={groupData.group_name} onChange={(e) => setGroupData({ ...groupData, group_name: e.target.value })} required /></div>
                {groupData.variants.map((variant, index) => (
                  <div className="card mb-2" key={index}><div className="card-body"><div className="row g-2"><div className="col-md-4"><label className="form-label">Variant Name *</label><input className="form-control" value={variant.name} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, name: e.target.value } : row) }))} required /></div><div className="col-md-2"><label className="form-label">Price *</label><input type="number" min="0" step="0.01" className="form-control" value={variant.price} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, price: e.target.value } : row) }))} required /></div><div className="col-md-2"><label className="form-label">Cost</label><input type="number" min="0" step="0.01" className="form-control" value={variant.cost} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, cost: e.target.value } : row) }))} /></div><div className="col-md-2"><label className="form-label">Unit</label><select className="form-select" value={variant.unit} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, unit: e.target.value } : row) }))}>{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></div><div className="col-md-2"><label className="form-label">Source</label><select className="form-select" value={variant.source} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, source: e.target.value } : row) }))}><option value="baked">Baked</option><option value="purchased">Purchased</option></select></div><div className="col-md-4"><label className="form-label">Category</label><select className="form-select" value={variant.category_id} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, category_id: e.target.value } : row) }))}><option value="">Select Category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div className="col-md-4"><label className="form-label">Low Stock Threshold *</label><input type="number" min="0" className="form-control" value={variant.low_stock_threshold} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, low_stock_threshold: e.target.value } : row) }))} required /></div><div className="col-md-4"><label className="form-label">Shelf Life (Days) *</label><input type="number" min="1" className="form-control" value={variant.shelf_life_days} onChange={(e) => setGroupData((prev) => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, shelf_life_days: e.target.value } : row) }))} required /></div></div></div></div>
                ))}
                <div className="d-flex gap-2"><button type="button" className="btn btn-outline-secondary" onClick={() => setGroupData((prev) => ({ ...prev, variants: [...prev.variants, { ...emptyVariant }] }))}>+ Add Variant Row</button>{groupData.variants.length > 1 && <button type="button" className="btn btn-outline-danger" onClick={() => setGroupData((prev) => ({ ...prev, variants: prev.variants.slice(0, -1) }))}>Remove Last</button>}</div>
                <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={resetForms}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create Group'}</button></div>
              </form>
            )}
            {showVariantForm && (
              <form onSubmit={handleCreateVariant} className="modal-body">
                <div className="row g-2"><div className="col-md-4"><label className="form-label">Variant Name *</label><input className="form-control" value={variantData.name} onChange={(e) => setVariantData({ ...variantData, name: e.target.value })} required /></div><div className="col-md-2"><label className="form-label">Price *</label><input type="number" className="form-control" min="0" step="0.01" value={variantData.price} onChange={(e) => setVariantData({ ...variantData, price: e.target.value })} required /></div><div className="col-md-2"><label className="form-label">Cost</label><input type="number" className="form-control" min="0" step="0.01" value={variantData.cost} onChange={(e) => setVariantData({ ...variantData, cost: e.target.value })} /></div><div className="col-md-2"><label className="form-label">Unit</label><select className="form-select" value={variantData.unit} onChange={(e) => setVariantData({ ...variantData, unit: e.target.value })}>{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></div><div className="col-md-2"><label className="form-label">Source</label><select className="form-select" value={variantData.source} onChange={(e) => setVariantData({ ...variantData, source: e.target.value })}><option value="baked">Baked</option><option value="purchased">Purchased</option></select></div><div className="col-md-4"><label className="form-label">Category</label><select className="form-select" value={variantData.category_id} onChange={(e) => setVariantData({ ...variantData, category_id: e.target.value })}><option value="">Select Category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div className="col-md-4"><label className="form-label">Low Stock Threshold *</label><input type="number" min="0" className="form-control" value={variantData.low_stock_threshold} onChange={(e) => setVariantData({ ...variantData, low_stock_threshold: e.target.value })} required /></div><div className="col-md-4"><label className="form-label">Shelf Life (Days) *</label><input type="number" min="1" className="form-control" value={variantData.shelf_life_days} onChange={(e) => setVariantData({ ...variantData, shelf_life_days: e.target.value })} required /></div></div>
                <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={resetForms}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add Variant'}</button></div>
              </form>
            )}
            {editingProduct && (
              <form onSubmit={handleEditSubmit} className="modal-body">
                <div className="row g-2"><div className="col-md-6"><label className="form-label">Group *</label><input className="form-control" value={formData.group_name} onChange={(e) => setFormData({ ...formData, group_name: e.target.value })} required /></div><div className="col-md-6"><label className="form-label">Variant Name *</label><input className="form-control" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div><div className="col-md-3"><label className="form-label">Price *</label><input type="number" className="form-control" min="0" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} required /></div><div className="col-md-3"><label className="form-label">Cost</label><input type="number" className="form-control" min="0" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} /></div><div className="col-md-3"><label className="form-label">Unit *</label><select className="form-select" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} required>{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></div><div className="col-md-3"><label className="form-label">Source *</label><select className="form-select" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })}><option value="baked">Baked</option><option value="purchased">Purchased</option></select></div><div className="col-md-6"><label className="form-label">Category</label><select className="form-select" value={formData.category_id} onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}><option value="">Select Category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div className="col-md-6"><label className="form-label">Low Stock Threshold *</label><input type="number" min="0" className="form-control" value={formData.low_stock_threshold} onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value })} required /></div><div className="col-md-6"><label className="form-label">Shelf Life (Days) *</label><input type="number" min="1" className="form-control" value={formData.shelf_life_days} onChange={(e) => setFormData({ ...formData, shelf_life_days: e.target.value })} required /></div></div><div className="row g-2 mt-1"><div className="col-md-6"><label className="form-label">Status</label><select className="form-select" value={formData.is_active ? 'active' : 'inactive'} onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div>
                <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={resetForms}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Update Variant'}</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
