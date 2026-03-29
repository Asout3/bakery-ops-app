import { Fragment, useState, useEffect, useMemo } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Package, Send, Plus, Minus } from 'lucide-react';
import './Inventory.css';
import { enqueueOperation, listQueuedOperations } from '../../utils/offlineQueue';
import { useToast } from '../../context/ToastContext';

export default function Inventory() {
  const { selectedLocationId } = useBranch();
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState({});
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const toast = useToast();

  useEffect(() => {
    fetchProducts();
    fetchInventory();
  }, [selectedLocationId]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      fetchProducts();
      fetchInventory();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [selectedLocationId]);

  const fetchProducts = async () => {
    try {
      const productsRes = await api.get('/products');
      const normalizedProducts = (productsRes.data || []).map((product) => ({
        ...product,
        source: product.source || 'baked',
      }));
      setProducts(normalizedProducts);
      localStorage.setItem(`manager_products_cache_${selectedLocationId || 'default'}`, JSON.stringify(normalizedProducts));
    } catch (err) {
      console.error('Failed to fetch products:', err);
      const cached = localStorage.getItem(`manager_products_cache_${selectedLocationId || 'default'}`);
      if (cached) {
        setProducts(JSON.parse(cached));
        toast.warning('Offline mode: using cached products list.');
      }
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory');
      const inventoryMap = {};
      response.data.forEach((item) => {
        inventoryMap[item.product_id] = item;
      });
      const inventoryWithPendingBatches = await applyPendingBatchesToInventory(inventoryMap);
      setInventory(inventoryWithPendingBatches);
      persistInventoryCache(inventoryWithPendingBatches);
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
      const cached = localStorage.getItem(`manager_inventory_cache_${selectedLocationId || 'default'}`);
      if (cached) {
        setInventory(JSON.parse(cached));
      }
    }
  };


  const persistInventoryCache = (inventoryMap) => {
    localStorage.setItem(`manager_inventory_cache_${selectedLocationId || 'default'}`, JSON.stringify(inventoryMap));
  };

  const applyBatchItemsToInventory = (baseInventory, batchItems = []) => {
    const nextInventory = { ...baseInventory };
    batchItems.forEach((item) => {
      const id = Number(item.product_id);
      const qty = Number(item.quantity || 0);
      const existing = nextInventory[id] || { product_id: id, quantity: 0 };
      nextInventory[id] = {
        ...existing,
        quantity: Number(existing.quantity || 0) + qty,
        source: item.source || existing.source || 'baked',
      };
    });
    return nextInventory;
  };

  const applyPendingBatchesToInventory = async (baseInventory) => {
    const queue = await listQueuedOperations();
    const pendingBatches = queue.filter((op) => op.url === '/inventory/batches' && op.method === 'post' && op.status !== 'conflict' && op.status !== 'needs_review' && String(op.headers?.['X-Location-Id'] || '') === String(selectedLocationId || ''));
    return pendingBatches.reduce((acc, op) => applyBatchItemsToInventory(acc, op.data?.items || []), baseInventory);
  };

  const addToCart = (product) => {
    const source = product.source || 'baked';
    const existing = cart.find(
      (item) => item.product_id === product.id && item.source === source
    );

    if (existing) {
      setCart(
        cart.map((item) =>
          item.product_id === product.id && item.source === source
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          name: product.name,
          source,
          quantity: 1,
        },
      ]);
    }
  };

  const updateCartQuantity = (productId, source, change) => {
    setCart(
      cart
        .map((item) => {
          if (item.product_id === productId && item.source === source) {
            const newQty = item.quantity + change;
            return newQty > 0 ? { ...item, quantity: newQty } : item;
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[`${productId}:${source}`];
      return next;
    });
  };

  const removeFromCart = (productId, source) => {
    setCart(
      cart.filter(
        (item) => !(item.product_id === productId && item.source === source)
      )
    );
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[`${productId}:${source}`];
      return next;
    });
  };


  const setCartQuantity = (productId, source, nextQuantity) => {
    const quantity = Number(nextQuantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Quantity must be greater than zero. Use Remove to delete an item.');
      return;
    }

    setCart(
      cart.map((item) => (
        item.product_id === productId && item.source === source
          ? { ...item, quantity }
          : item
      ))
    );
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[`${productId}:${source}`];
      return next;
    });
  };

  const getLowStockThreshold = (product) => {
    const threshold = Number(product?.low_stock_threshold);
    if (Number.isFinite(threshold) && threshold >= 0) return threshold;
    return 5;
  };

  const getStockStatus = (productId, product) => {
    const qty = Number(inventory[productId]?.quantity || 0);
    if (qty <= 0) return 'out';
    if (qty <= getLowStockThreshold(product)) return 'low';
    return 'healthy';
  };

  const stockCounts = useMemo(() => products
    .filter((product) => product.is_active !== false)
    .reduce((acc, product) => {
      const status = getStockStatus(product.id, product);
      acc[status] += 1;
      return acc;
    }, { low: 0, out: 0, healthy: 0 }), [products, inventory]);



  const groupedProducts = useMemo(() => {
    const grouped = new Map();
    products.filter((product) => product.is_active !== false).forEach((product) => {
      const group = product.group_name || product.name;
      const matchesGroup = groupFilter === 'all' || group === groupFilter;
      const matchesCategory = categoryFilter === 'all' || String(product.category_name || 'Uncategorized') === categoryFilter;
      const matchesStock = stockFilter === 'all' || getStockStatus(product.id, product) === stockFilter;
      if (!matchesGroup || !matchesCategory || !matchesStock) return;
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(product);
    });
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products, groupFilter, categoryFilter, stockFilter, inventory]);

  const handleSendBatch = async () => {
    if (cart.length === 0) {
      toast.warning('Cart is empty');
      return;
    }

    setLoading(true);
    try {
      await api.post('/inventory/batches', {
        items: cart,
        notes: 'Batch sent from manager',
      });

      toast.success('Batch sent successfully!');
      const optimisticInventory = applyBatchItemsToInventory(inventory, cart);
      setInventory(optimisticInventory);
      persistInventoryCache(optimisticInventory);
      setCart([]);
      fetchInventory();

      
    } catch (err) {
      if (!err.response) {
        const payload = { items: cart, notes: 'Batch sent from manager' };
        const idempotencyKey = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: '/inventory/batches', method: 'post', data: payload, idempotencyKey });
        const optimisticInventory = applyBatchItemsToInventory(inventory, cart);
        setInventory(optimisticInventory);
        persistInventoryCache(optimisticInventory);
        toast.info('Offline: batch queued for sync.');
        setCart([]);
      } else {
        toast.error(getErrorMessage(err, 'Failed to send batch'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inventory-page">
      <div className="inventory-header">
        <h2>Inventory Management</h2>
        {!isOnline && <div className="alert alert-warning">You are offline. Batch operations will be queued.</div>}
      </div>

      <div className="inventory-layout">
        <div className="products-list">
          <div className="card">
            <div className="card-header" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>Products</h3>
              <select className="form-select" style={{ maxWidth: '220px' }} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}><option value="all">All Groups</option>{Array.from(new Set(products.filter((p) => p.is_active !== false).map((p) => p.group_name || p.name))).sort().map((group) => <option key={group} value={group}>{group}</option>)}</select>
              <select className="form-select" style={{ maxWidth: '220px' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">All Categories</option>{Array.from(new Set(products.filter((p) => p.is_active !== false).map((p) => p.category_name || 'Uncategorized'))).sort().map((category) => <option key={category} value={category}>{category}</option>)}</select>
              <div className="manager-stock-filters">
                <button type="button" className={`stock-filter-btn ${stockFilter === 'all' ? 'active all' : ''}`} onClick={() => setStockFilter('all')}>All ({products.filter((p) => p.is_active !== false).length})</button>
                <button type="button" className={`stock-filter-btn ${stockFilter === 'low' ? 'active low' : ''}`} onClick={() => setStockFilter('low')}>Low Stock ({stockCounts.low})</button>
                <button type="button" className={`stock-filter-btn ${stockFilter === 'out' ? 'active out' : ''}`} onClick={() => setStockFilter('out')}>Out of Stock ({stockCounts.out})</button>
              </div>
            </div>
            <div className="card-body">
              <div className="products-table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Current Stock</th>
                      <th>Add to Batch</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedProducts.map(([group, variants]) => (
                      <Fragment key={group}>
                        <tr key={`${group}-header`}><td colSpan="4" style={{ fontWeight: 700, background: 'var(--bg-secondary, #f7f7f7)' }}>{group}</td></tr>
                        {variants.map((product) => {
                          const currentStock = inventory[product.id]?.quantity || 0;
                          return (
                            <tr key={product.id}>
                              <td>
                                <div className="product-info">
                                  <div className="product-name-table">{product.name}</div>
                                  <div className="product-category-table">{product.category_name}</div>
                                </div>
                              </td>
                              <td><span className="badge badge-primary">{currentStock} {product.unit}</span></td>
                              <td><button className="btn btn-sm btn-success" onClick={() => addToCart(product)}><Plus size={16} />Add</button></td>
                              <td><span className={`badge ${product.source === 'baked' ? 'badge-success' : 'badge-secondary'}`}>{product.source}</span></td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="batch-cart">
          <div className="card">
            <div className="card-header">
              <h3>
                <Package size={20} />
                Batch Cart ({cart.length})
              </h3>
            </div>

            <div className="card-body">
              {cart.length === 0 ? (
                <div className="empty-cart">
                  <Package size={48} />
                  <p>No items in batch</p>
                </div>
              ) : (
                <div className="cart-items">
                  {cart.map((item) => (
                    <div key={`${item.product_id}-${item.source}`} className="cart-item">
                      <div className="cart-item-header">
                        <div>
                          <div className="cart-item-name">{item.name}</div>
                          <span
                            className={`badge badge-${
                              item.source === 'baked' ? 'success' : 'secondary'
                            }`}
                          >
                            {item.source}
                          </span>
                        </div>
                      </div>

                      <div className="cart-item-actions">
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            updateCartQuantity(item.product_id, item.source, -1)
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          type="number"
                          min="1"
                          className="form-control form-control-sm"
                          style={{ width: '72px', textAlign: 'center' }}
                          value={quantityDrafts[`${item.product_id}:${item.source}`] ?? String(item.quantity)}
                          onChange={(e) => setQuantityDrafts((prev) => ({ ...prev, [`${item.product_id}:${item.source}`]: e.target.value }))}
                          onBlur={(e) => setCartQuantity(item.product_id, item.source, e.target.value)}
                        />
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            updateCartQuantity(item.product_id, item.source, 1)
                          }
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => removeFromCart(item.product_id, item.source)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-footer">
              <button
                className="btn btn-primary btn-lg"
                onClick={handleSendBatch}
                disabled={loading || cart.length === 0}
                style={{ width: '100%' }}
              >
                <Send size={20} />
                {loading ? 'Sending...' : 'Send Batch'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
