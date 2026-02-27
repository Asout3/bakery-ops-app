import { useState, useEffect } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Package, Send, Plus, Minus } from 'lucide-react';
import './Inventory.css';
import { enqueueOperation, listQueuedOperations } from '../../utils/offlineQueue';

export default function Inventory() {
  const { selectedLocationId } = useBranch();
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState({});
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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
      const [productsRes, inventoryRes] = await Promise.all([api.get('/products'), api.get('/inventory')]);
      const availableIds = new Set((inventoryRes.data || []).map((it) => Number(it.product_id)));
      const availableProducts = (productsRes.data || []).filter((product) => availableIds.has(Number(product.id)));
      const normalizedProducts = availableProducts.map((product) => ({
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
        setMessage({ type: 'warning', text: 'Offline mode: using cached products list.' });
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
  };

  const removeFromCart = (productId, source) => {
    setCart(
      cart.filter(
        (item) => !(item.product_id === productId && item.source === source)
      )
    );
  };

  const handleSendBatch = async () => {
    if (cart.length === 0) {
      setMessage({ type: 'warning', text: 'Cart is empty' });
      return;
    }

    setLoading(true);
    try {
      await api.post('/inventory/batches', {
        items: cart,
        notes: 'Batch sent from manager',
      });

      setMessage({ type: 'success', text: 'Batch sent successfully!' });
      const optimisticInventory = applyBatchItemsToInventory(inventory, cart);
      setInventory(optimisticInventory);
      persistInventoryCache(optimisticInventory);
      setCart([]);
      fetchInventory();

      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      if (!err.response) {
        const payload = { items: cart, notes: 'Batch sent from manager' };
        const idempotencyKey = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: '/inventory/batches', method: 'post', data: payload, idempotencyKey });
        const optimisticInventory = applyBatchItemsToInventory(inventory, cart);
        setInventory(optimisticInventory);
        persistInventoryCache(optimisticInventory);
        setMessage({ type: 'warning', text: 'Offline: batch queued for sync.' });
        setCart([]);
      } else {
        setMessage({
          type: 'danger',
          text: getErrorMessage(err, 'Failed to send batch'),
        });
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
        {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      </div>

      <div className="inventory-layout">
        <div className="products-list">
          <div className="card">
            <div className="card-header">
              <h3>Products</h3>
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
                    {products.map((product) => {
                      const currentStock = inventory[product.id]?.quantity || 0;
                      return (
                        <tr key={product.id}>
                          <td>
                            <div className="product-info">
                              <div className="product-name-table">{product.name}</div>
                              <div className="product-category-table">
                                {product.category_name}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-primary">
                              {currentStock} {product.unit}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => addToCart(product)}
                            >
                              <Plus size={16} />
                              Add
                            </button>
                          </td>
                          <td>
                            <span
                              className={`badge ${product.source === 'baked' ? 'badge-success' : 'badge-secondary'}`}
                            >
                              {product.source}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
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
                        <span className="cart-item-qty">{item.quantity}</span>
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
