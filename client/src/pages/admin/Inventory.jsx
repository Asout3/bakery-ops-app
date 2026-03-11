import { useState, useEffect, useMemo } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Plus, Edit, Trash2, Package, TrendingUp, TrendingDown, Search, RotateCcw, AlertCircle } from 'lucide-react';
import { enqueueOperation, listQueuedOperations } from '../../utils/offlineQueue';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/Table';
import { Skeleton } from '../../components/ui/Skeleton';
import { Alert } from '../../components/ui/Alert';

export default function AdminInventory() {
  const { selectedLocationId } = useBranch();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: '',
    source: 'baked'
  });

  const persistInventoryCache = useCallback((payload) => {
    localStorage.setItem(`admin_inventory_cache_${selectedLocationId || 'default'}`, JSON.stringify(payload));
  }, [selectedLocationId]);

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

  const fetchData = useCallback(async () => {
    setLoading(true);
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
        toast.info('Offline mode: using cached inventory.');
      } else {
        toast.error(getErrorMessage(err, 'Failed to fetch inventory data.'));
      }
    } finally {
      setLoading(false);
    }
  }, [selectedLocationId, persistInventoryCache, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      toast.success(editingItem ? 'Inventory updated.' : 'Inventory added.');
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `inventory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const op = editingItem
          ? { url: `/inventory/${editingItem.product_id}`, method: 'put', data: { quantity: payload.quantity, source: payload.source }, idempotencyKey }
          : { id: idempotencyKey, url: '/inventory', method: 'post', data: payload, idempotencyKey };
        await enqueueOperation(op);
        await fetchData();
        resetForm();
        toast.warning('Offline: inventory change queued for sync.');
      } else {
        toast.error(getErrorMessage(err, 'Failed to save inventory item.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Inventory Item?',
      message: 'Are you sure you want to delete this item from inventory? This action cannot be undone.',
      variant: 'danger'
    });

    if (!isConfirmed) return;

    try {
      await api.delete(`/inventory/${id}`);
      await fetchData();
      toast.success('Inventory item deleted.');
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `inventory-delete-${id}-${Date.now()}`;
        await enqueueOperation({ url: `/inventory/${id}`, method: 'delete', data: {}, idempotencyKey });
        setInventory((current) => {
          const nextInventory = current.filter((item) => String(item.id) !== String(id));
          persistInventoryCache({ inventory: nextInventory, products });
          return nextInventory;
        });
        toast.warning('Offline: delete queued for sync.');
      } else {
        toast.error(getErrorMessage(err, 'Failed to delete inventory item.'));
      }
    }
  };


  const availableProductsForCreate = products.filter((product) => {
    if (editingItem) {
      return true;
    }
    return product.is_active !== false && !inventory.some((item) => Number(item.product_id) === Number(product.id));
  });


  const filteredInventory = inventory.filter((item) => {
    const product = products.find((p) => Number(p.id) === Number(item.product_id));
    if (!product || product.is_active === false) return false;
    const text = `${product?.group_name || product?.name || ''} ${product?.name || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const groupedInventory = filteredInventory.reduce((acc, item) => {
    const product = products.find((p) => Number(p.id) === Number(item.product_id));
    const group = product?.group_name || product?.name || 'Ungrouped';
    if (!acc[group]) acc[group] = [];
    acc[group].push({ item, product });
    return acc;
  }, {});

  const stats = useMemo(() => {
    const totalItems = inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const inStock = inventory.filter((item) => Number(item.quantity || 0) > 10).length;
    const lowStock = inventory.filter((item) => Number(item.quantity || 0) <= 5).length;
    return { totalItems, inStock, lowStock };
  }, [inventory]);

  if (loading) return (
    <div className="animate-fade-in">
       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
         <Skeleton width="240px" height="2.5rem" />
         <Skeleton width="140px" height="2.5rem" />
       </div>
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
          {[1, 2, 3].map(i => <Skeleton key={i} height="120px" />)}
       </div>
       <Skeleton height="80px" style={{ marginBottom: '2rem' }} />
       {[1, 2].map(i => <Skeleton key={i} height="300px" style={{ marginBottom: '1.5rem' }} />)}
    </div>
  );

  return (
    <div className="inventory-page animate-fade-in">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem' }}>Inventory Management</h1>
        <Button
          variant="primary"
          onClick={() => {
            setEditingItem(null);
            setFormData({ product_id: '', quantity: '', source: 'baked' });
            setShowForm(true);
          }}
        >
          <Plus size={18} /> Add Item
        </Button>
      </div>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ padding: '1.5rem', background: 'var(--card-bg)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(244, 162, 97, 0.1)', color: 'var(--button-end)', display: 'grid', placeItems: 'center' }}>
            <Package size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.totalItems}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Units</div>
          </div>
        </div>
        <div style={{ padding: '1.5rem', background: 'var(--card-bg)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--success-bg)', color: 'var(--success-text)', display: 'grid', placeItems: 'center' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.inStock}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Healthy Stock</div>
          </div>
        </div>
        <div style={{ padding: '1.5rem', background: 'var(--card-bg)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--error-bg)', color: 'var(--text-error)', display: 'grid', placeItems: 'center' }}>
            <TrendingDown size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.lowStock}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Low Stock Items</div>
          </div>
        </div>
      </div>

      <Card style={{ marginBottom: '2rem' }}>
        <CardBody style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <Input
              placeholder="Search by product name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '2.75rem' }}
            />
          </div>
          <Button variant="secondary" onClick={() => { setSearch(''); fetchData(); }}>
            <RotateCcw size={18} />
          </Button>
        </CardBody>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {Object.keys(groupedInventory).sort((a, b) => a.localeCompare(b)).map((group) => (
          <Card key={group}>
            <CardHeader style={{ background: 'rgba(95, 58, 36, 0.02)', padding: '1rem 1.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', margin: 0 }}>{group}</h3>
            </CardHeader>
            <CardBody style={{ padding: 0 }}>
              <Table>
                <THead>
                  <TR>
                    <TH>Inventory ID</TH>
                    <TH>Variant</TH>
                    <TH>Quantity</TH>
                    <TH>Last Updated</TH>
                    <TH>Source</TH>
                    <TH style={{ textAlign: 'right' }}>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {groupedInventory[group].map(({ item, product }) => (
                    <TR key={item.id}>
                      <TD style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {`INV-${String(item.id).padStart(6, '0')}`}
                      </TD>
                      <TD>
                         <div style={{ fontWeight: 600 }}>{product?.name || item.product_id}</div>
                         {product?.is_active === false && <Badge variant="warning">Archived Product</Badge>}
                      </TD>
                      <TD>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                           <Badge variant={Number(item.quantity) <= 5 ? 'danger' : Number(item.quantity) <= 10 ? 'warning' : 'success'}>
                             {item.quantity}
                           </Badge>
                           {item.is_pending_sync && (
                             <Badge variant="info" title="Offline change pending sync">Syncing...</Badge>
                           )}
                        </div>
                      </TD>
                      <TD style={{ fontSize: '0.875rem' }}>{new Date(item.last_updated).toLocaleDateString()}</TD>
                      <TD>
                        <Badge variant={item.source === 'baked' ? 'info' : 'secondary'}>
                          {item.source}
                        </Badge>
                      </TD>
                      <TD style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                           <Button
                             variant="secondary"
                             size="sm"
                             onClick={() => {
                               setEditingItem(item);
                               setFormData({ product_id: item.product_id, quantity: item.quantity, source: item.source || 'baked' });
                               setShowForm(true);
                             }}
                           >
                             <Edit size={14} />
                           </Button>
                           <Button variant="danger" size="sm" onClick={() => handleDelete(item.id)}>
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
        {Object.keys(groupedInventory).length === 0 && (
          <Card style={{ textAlign: 'center', padding: '4rem' }}>
             <Package size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.2 }} />
             <h3 style={{ color: 'var(--text-muted)' }}>No inventory found</h3>
             <p>Try searching for a different product or add new inventory.</p>
          </Card>
        )}
      </div>

      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={editingItem ? 'Edit Inventory Item' : 'Add New Inventory Item'}
        size="sm"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Select
            label="Product Variant *"
            value={formData.product_id}
            onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
            required
            disabled={!!editingItem}
            options={[
              { label: 'Select Product Variant', value: '' },
              ...availableProductsForCreate.map((p) => ({
                label: `${p.group_name || p.name} / ${p.name}`,
                value: p.id
              }))
            ]}
          />
          {editingItem && (
            <Alert variant="info" style={{ fontSize: '0.8125rem' }}>
              Product cannot be changed when editing. Only quantity and source are editable.
            </Alert>
          )}

          <Input
            label="Quantity *"
            type="number"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            required
            min="0"
          />

          <Select
            label="Source"
            value={formData.source}
            onChange={(e) => setFormData({ ...formData, source: e.target.value })}
            options={[
              { label: 'Baked', value: 'baked' },
              { label: 'Purchased', value: 'purchased' }
            ]}
          />

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <Button variant="secondary" onClick={resetForm} type="button">Cancel</Button>
            <Button type="submit" isLoading={saving}>{editingItem ? 'Update' : 'Add'} Item</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
