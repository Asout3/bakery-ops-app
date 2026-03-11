import { useState, useEffect, useMemo } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { Plus, Edit, Trash2, Search, Pencil, Archive, CheckCircle2, Package } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';

const UNIT_OPTIONS = [
  { label: 'Piece', value: 'piece' },
  { label: 'KG', value: 'kg' },
  { label: 'Gram', value: 'gram' },
  { label: 'Liter', value: 'liter' },
  { label: 'Pack', value: 'pack' },
  { label: 'Tray', value: 'tray' },
];

const emptyVariant = { name: '', price: '', cost: '', unit: 'piece', source: 'baked', category_id: '' };

const formatProductDisplayId = (product) => {
  const group = (product.group_name || product.name || 'PRD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PRD';
  return `${group}-${String(product.id).padStart(4, '0')}`;
};

export default function ProductsPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [groupRename, setGroupRename] = useState({ name: '', next: '' });

  const [groupData, setGroupData] = useState({ group_name: '', variants: [{ ...emptyVariant }] });
  const [variantData, setVariantData] = useState({ ...emptyVariant, group_name: '' });
  const [formData, setFormData] = useState({ name: '', group_name: '', category_id: '', price: '', cost: '', unit: 'piece', source: 'baked', is_active: true });

  const fetchCategories = useCallback(async () => {
    try {
      const response = await api.get('/products/categories');
      setCategories(response.data || []);
    } catch {
      toast.error('Failed to load categories.');
    }
  }, [toast]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/products');
      setProducts(response.data || []);
    } catch {
      toast.error('Failed to fetch products.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [fetchProducts, fetchCategories]);

  const resetForms = () => {
    setShowGroupForm(false);
    setShowVariantForm(false);
    setEditingProduct(null);
    setFormData({ name: '', group_name: '', category_id: '', price: '', cost: '', unit: 'piece', source: 'baked', is_active: true });
    setGroupData({ group_name: '', variants: [{ ...emptyVariant }] });
    setVariantData({ ...emptyVariant, group_name: '' });
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const response = await api.post('/products/categories', { name: newCategoryName.trim() });
      setCategories((current) => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName('');
      toast.success(t('categoryAdded'));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add category.'));
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const validVariants = groupData.variants.filter((variant) => variant.name && variant.price !== '');
      if (!validVariants.length) {
        toast.warning('Add at least one variant.');
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
        });
      }
      await fetchProducts();
      resetForms();
      toast.success('Product group created.');
    } catch (err) {
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
      await api.post('/products', {
        name: variantData.name,
        group_name: variantData.group_name,
        category_id: variantData.category_id || null,
        price: variantData.price,
        cost: variantData.cost || null,
        unit: variantData.unit || 'piece',
        source: variantData.source || 'baked',
      });
      await fetchProducts();
      resetForms();
      toast.success('Variant added to group.');
    } catch (err) {
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
      await api.put(`/products/${editingProduct.id}`, formData);
      await fetchProducts();
      resetForms();
      toast.success('Variant updated.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save product.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Variant?',
      message: t('deleteVariantConfirm'),
      variant: 'danger'
    });

    if (!isConfirmed) return;

    try {
      await api.delete(`/products/${id}`);
      await fetchProducts();
      toast.success('Variant deleted.');
    } catch (err) {
      if (err?.response?.data?.code === 'PRODUCT_DELETE_BLOCKED') {
        await api.put(`/products/${id}`, { is_active: false });
        await fetchProducts();
        toast.warning('Variant archived because it has linked history.');
      } else {
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
      toast.success(`Group renamed to ${nextName}.`);
    } catch (err) {
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

  if (loading) return (
    <div className="animate-fade-in">
       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
         <Skeleton width="200px" height="2.5rem" />
         <div style={{ display: 'flex', gap: '1rem' }}>
           <Skeleton width="120px" height="2.5rem" />
           <Skeleton width="160px" height="2.5rem" />
         </div>
       </div>
       <Skeleton height="100px" style={{ marginBottom: '2rem' }} />
       {[1, 2, 3].map(i => <Skeleton key={i} height="300px" style={{ marginBottom: '1.5rem' }} />)}
    </div>
  );

  return (
    <div className="products-page animate-fade-in">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem' }}>{t('products')}</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={() => setShowArchived((p) => !p)}>
            {showArchived ? <Archive size={18} /> : <Archive size={18} />}
            {showArchived ? t('hideArchived') : t('seeArchivedProducts')}
          </Button>
          <Button variant="primary" onClick={() => { resetForms(); setShowGroupForm(true); }}>
            <Plus size={18} /> {t('addProductGroup')}
          </Button>
        </div>
      </div>

      <Card style={{ marginBottom: '2rem', border: '1px solid var(--accent-border)' }}>
        <CardBody style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'flex-end' }}>
          <div>
            <label className="form-label" style={{ marginBottom: '0.5rem' }}>{t('searchProducts')}</label>
            <div style={{ position: 'relative' }}>
               <Search size={18} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
               <Input
                 placeholder={t('searchGroupsOrVariants')}
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 style={{ paddingLeft: '2.75rem' }}
               />
            </div>
          </div>
          <div>
            <label className="form-label" style={{ marginBottom: '0.5rem' }}>{t('addCategory')}</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Input
                placeholder="Category name..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <Button variant="outline" onClick={handleCreateCategory} style={{ whiteSpace: 'nowrap' }}>
                <Plus size={18} /> {t('addCategory')}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {groupedProducts.map(([groupName, variants]) => (
        <Card style={{ marginBottom: '2rem' }} key={groupName}>
          <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem' }}>
            {groupRename.name === groupName ? (
              <div style={{ display: 'flex', gap: '0.75rem', flex: 1, maxWidth: '500px' }}>
                <Input
                  value={groupRename.next}
                  onChange={(e) => setGroupRename((prev) => ({ ...prev, next: e.target.value }))}
                  style={{ minHeight: '2.25rem' }}
                />
                <Button size="sm" onClick={() => handleRenameGroup(groupName)} isLoading={saving}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setGroupRename({ name: '', next: '' })}>Cancel</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(244, 162, 97, 0.1)', color: 'var(--button-end)', display: 'grid', placeItems: 'center' }}>
                  <Package size={20} />
                </div>
                <h3 style={{ fontSize: '1.25rem', margin: 0 }}>{groupName}</h3>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="secondary" size="sm" onClick={() => setGroupRename({ name: groupName, next: groupName })}>
                <Pencil size={14} /> Rename
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setVariantData({ ...emptyVariant, group_name: groupName, category_id: variants[0]?.category_id || '' }); setShowVariantForm(true); }}>
                <Plus size={14} /> Add Variant
              </Button>
            </div>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            <Table>
              <THead>
                <TR>
                  <TH>ID</TH>
                  <TH>Variant</TH>
                  <TH>Category</TH>
                  <TH>Source</TH>
                  <TH>Price</TH>
                  <TH>Cost</TH>
                  <TH>Unit</TH>
                  <TH>Status</TH>
                  <TH style={{ textAlign: 'right' }}>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {variants.map((product) => (
                  <TR key={product.id}>
                    <TD style={{ fontSize: '0.8125rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)' }}>
                      {formatProductDisplayId(product)}
                    </TD>
                    <TD style={{ fontWeight: 600 }}>{product.name}</TD>
                    <TD>
                      {product.category_name || categories.find((c) => Number(c.id) === Number(product.category_id))?.name || (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>None</span>
                      )}
                    </TD>
                    <TD>
                      <Badge variant={product.source === 'purchased' ? 'warning' : 'info'}>
                        {product.source || 'baked'}
                      </Badge>
                    </TD>
                    <TD style={{ fontWeight: 700 }}>ETB {Number(product.price || 0).toFixed(2)}</TD>
                    <TD style={{ color: 'var(--text-muted)' }}>ETB {Number(product.cost || 0).toFixed(2)}</TD>
                    <TD style={{ textTransform: 'capitalize' }}>{product.unit}</TD>
                    <TD>
                      <Badge variant={product.is_active === false ? 'danger' : 'success'}>
                        {product.is_active === false ? 'Inactive' : 'Active'}
                      </Badge>
                    </TD>
                    <TD style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          style={{ padding: '0.4rem' }}
                          onClick={() => {
                            setEditingProduct(product);
                            setFormData({
                              name: product.name,
                              group_name: product.group_name || groupName,
                              category_id: product.category_id || '',
                              price: product.price,
                              cost: product.cost || '',
                              unit: product.unit || 'piece',
                              source: product.source || 'baked',
                              is_active: Boolean(product.is_active)
                            });
                          }}
                        >
                          <Edit size={14} />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          style={{ padding: '0.4rem' }}
                          onClick={() => handleDelete(product.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      ))}

      <Modal
        isOpen={showGroupForm}
        onClose={resetForms}
        title="Create Product Group"
        size="lg"
      >
        <form onSubmit={handleCreateGroup}>
          <div style={{ marginBottom: '2rem' }}>
            <Input
              label="Group Name *"
              value={groupData.group_name}
              onChange={(e) => setGroupData({ ...groupData, group_name: e.target.value })}
              required
              placeholder="e.g. Whole Cakes"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
            <h4 style={{ fontSize: '1rem', borderBottom: '1px solid var(--accent-border)', paddingBottom: '0.5rem' }}>Variants</h4>
            {groupData.variants.map((variant, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'flex-end', background: 'var(--surface-bg)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--accent-border)' }}>
                <Input
                  label="Name *"
                  value={variant.name}
                  onChange={(e) => setGroupData(prev => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, name: e.target.value } : row) }))}
                  required
                />
                <Input
                  label="Price *"
                  type="number"
                  step="0.01"
                  value={variant.price}
                  onChange={(e) => setGroupData(prev => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, price: e.target.value } : row) }))}
                  required
                />
                <Input
                  label="Cost"
                  type="number"
                  step="0.01"
                  value={variant.cost}
                  onChange={(e) => setGroupData(prev => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, cost: e.target.value } : row) }))}
                />
                <Select
                  label="Unit"
                  value={variant.unit}
                  options={UNIT_OPTIONS}
                  onChange={(e) => setGroupData(prev => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, unit: e.target.value } : row) }))}
                />
                <Select
                  label="Source"
                  value={variant.source}
                  options={[{ label: 'Baked', value: 'baked' }, { label: 'Purchased', value: 'purchased' }]}
                  onChange={(e) => setGroupData(prev => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, source: e.target.value } : row) }))}
                />
                <Select
                  label="Category"
                  value={variant.category_id}
                  options={[{ label: 'None', value: '' }, ...categories.map(c => ({ label: c.name, value: c.id }))]}
                  onChange={(e) => setGroupData(prev => ({ ...prev, variants: prev.variants.map((row, i) => i === index ? { ...row, category_id: e.target.value } : row) }))}
                />
                {groupData.variants.length > 1 && (
                  <Button
                    variant="danger"
                    size="sm"
                    type="button"
                    style={{ padding: '0.5rem' }}
                    onClick={() => setGroupData(prev => ({ ...prev, variants: prev.variants.filter((_, i) => i !== index) }))}
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              type="button"
              onClick={() => setGroupData(prev => ({ ...prev, variants: [...prev.variants, { ...emptyVariant }] }))}
              style={{ alignSelf: 'flex-start' }}
            >
              <Plus size={18} /> Add Another Variant
            </Button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--accent-border)' }}>
            <Button variant="secondary" onClick={resetForms} type="button">Cancel</Button>
            <Button type="submit" isLoading={saving}>Create Product Group</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showVariantForm}
        onClose={resetForms}
        title={`Add Variant to ${variantData.group_name}`}
        size="lg"
      >
        <form onSubmit={handleCreateVariant}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
            <Input
              label="Variant Name *"
              value={variantData.name}
              onChange={(e) => setVariantData({ ...variantData, name: e.target.value })}
              required
              placeholder="e.g. Small"
            />
            <Input
              label="Price *"
              type="number"
              step="0.01"
              value={variantData.price}
              onChange={(e) => setVariantData({ ...variantData, price: e.target.value })}
              required
            />
            <Input
              label="Cost"
              type="number"
              step="0.01"
              value={variantData.cost}
              onChange={(e) => setVariantData({ ...variantData, cost: e.target.value })}
            />
            <Select
              label="Unit"
              value={variantData.unit}
              options={UNIT_OPTIONS}
              onChange={(e) => setVariantData({ ...variantData, unit: e.target.value })}
            />
            <Select
              label="Source"
              value={variantData.source}
              options={[{ label: 'Baked', value: 'baked' }, { label: 'Purchased', value: 'purchased' }]}
              onChange={(e) => setVariantData({ ...variantData, source: e.target.value })}
            />
            <Select
              label="Category"
              value={variantData.category_id}
              options={[{ label: 'None', value: '' }, ...categories.map(c => ({ label: c.name, value: c.id }))]}
              onChange={(e) => setVariantData({ ...variantData, category_id: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--accent-border)' }}>
            <Button variant="secondary" onClick={resetForms} type="button">Cancel</Button>
            <Button type="submit" isLoading={saving}>Add Variant</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!editingProduct}
        onClose={resetForms}
        title="Edit Variant"
        size="lg"
      >
        <form onSubmit={handleEditSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
            <Input
              label="Group Name *"
              value={formData.group_name}
              onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
              required
            />
            <Input
              label="Variant Name *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="Price *"
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              required
            />
            <Input
              label="Cost"
              type="number"
              step="0.01"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
            />
            <Select
              label="Unit"
              value={formData.unit}
              options={UNIT_OPTIONS}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            />
            <Select
              label="Source"
              value={formData.source}
              options={[{ label: 'Baked', value: 'baked' }, { label: 'Purchased', value: 'purchased' }]}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
            />
            <Select
              label="Category"
              value={formData.category_id}
              options={[{ label: 'None', value: '' }, ...categories.map(c => ({ label: c.name, value: c.id }))]}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
            />
            <Select
              label="Status"
              value={formData.is_active ? 'active' : 'inactive'}
              options={[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }]}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--accent-border)' }}>
            <Button variant="secondary" onClick={resetForms} type="button">Cancel</Button>
            <Button type="submit" isLoading={saving}>Update Variant</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
