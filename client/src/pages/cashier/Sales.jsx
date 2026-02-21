import { useState, useEffect, useRef } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Plus, Minus, ShoppingCart, Trash2, Search } from 'lucide-react';
import './Sales.css';
import { enqueueOperation, listQueuedOperations } from '../../utils/offlineQueue';
import { useLanguage } from '../../context/LanguageContext';

export default function Sales() {
  const { selectedLocationId } = useBranch();
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [orderStartedAt, setOrderStartedAt] = useState(Date.now());
  const [receiptData, setReceiptData] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const checkoutInFlightRef = useRef(false);

  useEffect(() => {
    fetchProducts();
  }, [selectedLocationId]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      fetchProducts();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);


  const persistProductsCache = (nextProducts) => {
    localStorage.setItem(`cashier_products_cache_${selectedLocationId || 'default'}`, JSON.stringify(nextProducts));
  };

  const applyPendingSalesToProducts = async (baseProducts) => {
    const queue = await listQueuedOperations();
    const pendingSales = queue.filter((op) => op.url === '/sales' && op.method === 'post' && op.status !== 'conflict');
    if (!pendingSales.length) {
      return baseProducts;
    }
    const usageByProduct = new Map();
    pendingSales.forEach((op) => {
      (op.data?.items || []).forEach((item) => {
        const id = Number(item.product_id);
        const current = usageByProduct.get(id) || 0;
        usageByProduct.set(id, current + Number(item.quantity || 0));
      });
    });

    return baseProducts.map((product) => ({
      ...product,
      stock_quantity: Math.max(0, Number(product.stock_quantity || 0) - (usageByProduct.get(Number(product.id)) || 0))
    }));
  };
  const fetchProducts = async () => {
    try {
      const [productsRes, inventoryRes] = await Promise.all([api.get('/products'), api.get('/inventory')]);
      const inventoryByProduct = new Map((inventoryRes.data || []).map((it) => [Number(it.product_id), Number(it.quantity) || 0]));
      const productsWithStock = (productsRes.data || []).map((product) => ({
        ...product,
        stock_quantity: inventoryByProduct.get(Number(product.id)) || 0
      }));
      const productsWithPendingApplied = await applyPendingSalesToProducts(productsWithStock);
      setProducts(productsWithPendingApplied);
      persistProductsCache(productsWithPendingApplied);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      const cached = localStorage.getItem(`cashier_products_cache_${selectedLocationId || 'default'}`);
      if (cached) {
        setProducts(JSON.parse(cached));
        setMessage({ type: 'warning', text: 'Offline mode: using cached products.' });
      }
    }
  };

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCartQuantity = (productId) => cart.find((item) => item.product_id === productId)?.quantity || 0;

  const getRemainingStock = (product) => Number(product.stock_quantity || 0) - getCartQuantity(product.id);

  const applySaleToLocalStock = (soldItems) => {
    setProducts((current) => {
      const nextProducts = current.map((product) => {
      const soldItem = soldItems.find((item) => Number(item.product_id) === Number(product.id));
      if (!soldItem) {
        return product;
      }
      return {
        ...product,
        stock_quantity: Math.max(0, Number(product.stock_quantity || 0) - Number(soldItem.quantity || 0))
      };
    });
      persistProductsCache(nextProducts);
      return nextProducts;
    });
  };

  const addToCart = (product) => {
    if (getRemainingStock(product) <= 0) {
      setMessage({ type: 'warning', text: `${product.name} is out of stock.` });
      return;
    }

    if (cart.length === 0) {
      setOrderStartedAt(Date.now());
    }
    const existing = cart.find((item) => item.product_id === product.id);
    
    if (existing) {
      setCart(cart.map((item) =>
        item.product_id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1
      }]);
    }
  };

  const updateQuantity = (productId, change) => {
    const product = products.find((item) => item.id === productId);
    setCart(cart.map((item) => {
      if (item.product_id === productId) {
        const newQty = item.quantity + change;
        if (change > 0 && product && newQty > Number(product.stock_quantity || 0)) {
          setMessage({ type: 'warning', text: `${item.name} has insufficient stock.` });
          return item;
        }
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter((item) => item.product_id !== productId));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const handleCheckout = async () => {
    if (checkoutInFlightRef.current || loading) {
      return;
    }

    if (cart.length === 0) {
      setMessage({ type: 'warning', text: 'Cart is empty' });
      return;
    }

    const payload = {
      items: cart.map(item => ({ product_id: item.product_id, quantity: item.quantity })),
      payment_method: paymentMethod,
      cashier_timing_ms: Date.now() - orderStartedAt
    };
    const idempotencyKey = `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    checkoutInFlightRef.current = true;
    setLoading(true);
    try {
      const response = await api.post('/sales', payload, {
        headers: {
          'X-Idempotency-Key': idempotencyKey,
        },
      });

      setMessage({ type: 'success', text: `Sale completed! Receipt: ${response.data.receipt_number}` });
      setReceiptData(response.data);
      applySaleToLocalStock(payload.items);
      setCart([]);
      setPaymentMethod('cash');
      setOrderStartedAt(Date.now());
      fetchProducts();

      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      if (!err.response) {
        await enqueueOperation({ id: idempotencyKey, url: '/sales', method: 'post', data: payload, idempotencyKey });
        setMessage({ type: 'warning', text: 'Offline: sale queued for sync.' });
        applySaleToLocalStock(payload.items);
        setCart([]);
        setPaymentMethod('cash');
        setOrderStartedAt(Date.now());
      } else {
        setMessage({
          type: 'danger',
          text: getErrorMessage(err, 'Failed to process sale')
        });
      }
    } finally {
      setLoading(false);
      checkoutInFlightRef.current = false;
    }
  };

  return (
    <div className="sales-page">
      <div className="sales-header">
        <h2>{t('newSale')}</h2>
        {!isOnline && <div className="alert alert-warning">You are offline. Sales will be queued and synced automatically.</div>}
        {message && (
          <div className={`alert alert-${message.type}`}>
            {message.text}
          </div>
        )}
      </div>

      <div className="sales-layout">
        <div className="products-section">
          <div className="search-bar">
            <Search size={20} />
            <input
              type="text"
              placeholder="Search products..."
              className="input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="products-grid">
            {filteredProducts.map((product) => (
              (() => {
                const remainingStock = getRemainingStock(product);
                const isOutOfStock = remainingStock <= 0;
                return (
              <div
                key={product.id}
                className={`product-card ${isOutOfStock ? 'product-card-disabled' : ''}`}
                onClick={() => !isOutOfStock && addToCart(product)}
              >
                <div className="product-name">{product.name}</div>
                <div className="product-price">${Number(product.price).toFixed(2)}</div>
                <div className="product-category">{product.category_name}</div>
                <div className={`product-stock ${isOutOfStock ? 'product-stock-empty' : ''}`}>
                  {isOutOfStock ? 'Out of stock' : `${remainingStock} in stock`}
                </div>
              </div>
                );
              })()
            ))}
          </div>
        </div>

        <div className="cart-section">
          <div className="card">
            <div className="card-header">
              <h3>
                <ShoppingCart size={20} />
                Cart ({cart.length})
              </h3>
            </div>

            <div className="card-body cart-body">
              {cart.length === 0 ? (
                <div className="empty-cart">
                  <ShoppingCart size={48} />
                  <p>{t('cartEmpty')}</p>
                </div>
              ) : (
                <div className="cart-items">
                  {cart.map((item) => (
                    <div key={item.product_id} className="cart-item">
                      <div className="cart-item-details">
                        <div className="cart-item-name">{item.name}</div>
                        <div className="cart-item-price">
                          ${Number(item.price).toFixed(2)}
                        </div>
                      </div>

                      <div className="cart-item-actions">
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => updateQuantity(item.product_id, -1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span className="cart-item-qty">{item.quantity}</span>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => updateQuantity(item.product_id, 1)}
                          disabled={item.quantity >= Number(products.find((product) => product.id === item.product_id)?.stock_quantity || 0)}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => removeFromCart(item.product_id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="cart-item-subtotal">
                        ETB {(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-footer">
              <div className="payment-method-select">
                <span>Payment:</span>
                <select
                  className="input"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="mobile">Mobile Banking</option>
                </select>
              </div>
              <div className="cart-total">
                <span className="cart-total-label">Total:</span>
                <span className="cart-total-amount">
                  ETB {calculateTotal().toFixed(2)}
                </span>
              </div>
              <button
                className="btn btn-success btn-lg"
                onClick={handleCheckout}
                disabled={loading || cart.length === 0}
                style={{ width: '100%', marginTop: '1rem' }}
              >
                {loading ? t('processing') : isOnline ? t('completeSale') : t('queueSaleOffline')}
              </button>
            </div>
          </div>
        </div>
      </div>
      {receiptData && (
        <div className="modal-overlay" onClick={() => setReceiptData(null)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Receipt</h3><button className="close-btn" onClick={() => setReceiptData(null)}>×</button></div>
            <div className="modal-body">
              <p><strong>Receipt #:</strong> {receiptData.receipt_number}</p>
              <p><strong>Date:</strong> {new Date(receiptData.sale_date || Date.now()).toLocaleString()}</p>
              <p><strong>Payment Method:</strong> {receiptData.payment_method || paymentMethod}</p>
              <p><strong>Total:</strong> ${Number(receiptData.total_amount || 0).toFixed(2)}</p>
              <hr />
              <div>
                {(receiptData.items || []).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span>{item.product_name} × {item.quantity}</span>
                    <span>ETB {Number(item.subtotal).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
