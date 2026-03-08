import { useState, useEffect, useRef, useMemo } from 'react';
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
  const [sourceFilter, setSourceFilter] = useState('all');
  const [receiptData, setReceiptData] = useState(null);
  const [variantModal, setVariantModal] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const checkoutInFlightRef = useRef(false);

  useEffect(() => { fetchProducts(); }, [selectedLocationId]);
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); fetchProducts(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const persistProductsCache = (nextProducts) => localStorage.setItem(`cashier_products_cache_${selectedLocationId || 'default'}`, JSON.stringify(nextProducts));

  const applyPendingSalesToProducts = async (baseProducts) => {
    const queue = await listQueuedOperations();
    const pendingSales = queue.filter((op) => op.url === '/sales' && op.method === 'post' && op.status !== 'conflict');
    if (!pendingSales.length) return baseProducts;
    const usageByProduct = new Map();
    pendingSales.forEach((op) => (op.data?.items || []).forEach((item) => usageByProduct.set(Number(item.product_id), (usageByProduct.get(Number(item.product_id)) || 0) + Number(item.quantity || 0))));
    return baseProducts.map((product) => ({ ...product, stock_quantity: Math.max(0, Number(product.stock_quantity || 0) - (usageByProduct.get(Number(product.id)) || 0)) }));
  };

  const fetchProducts = async () => {
    try {
      const [productsRes, inventoryRes] = await Promise.all([api.get('/products'), api.get('/inventory')]);
      const inventoryByProduct = new Map((inventoryRes.data || []).map((it) => [Number(it.product_id), Number(it.quantity) || 0]));
      const productsWithStock = (productsRes.data || [])
        .map((product) => ({ ...product, stock_quantity: inventoryByProduct.get(Number(product.id)) || 0 }));
      const productsWithPendingApplied = await applyPendingSalesToProducts(productsWithStock);
      setProducts(productsWithPendingApplied);
      persistProductsCache(productsWithPendingApplied);
    } catch {
      const cached = localStorage.getItem(`cashier_products_cache_${selectedLocationId || 'default'}`);
      if (cached) {
        setProducts(JSON.parse(cached));
        setMessage({ type: 'warning', text: 'Offline mode: using cached products.' });
      }
    }
  };

  const groupedProducts = useMemo(() => {
    const map = new Map();
    products
      .filter((product) => {
        const groupKey = product.group_name || product.name;
        const matchesSearch = `${groupKey} ${product.name}`.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSource = sourceFilter === 'all' || (product.source || 'baked') === sourceFilter;
        return matchesSearch && matchesSource;
      })
      .forEach((product) => {
        const key = product.group_name || product.name;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(product);
      });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products, searchTerm, sourceFilter]);

  const getCartQuantity = (productId) => cart.find((item) => item.product_id === productId)?.quantity || 0;
  const getRemainingStock = (product) => Number(product.stock_quantity || 0) - getCartQuantity(product.id);

  const addVariantToCart = (product) => {
    if (getRemainingStock(product) <= 0) {
      setMessage({ type: 'warning', text: `${product.name} is out of stock.` });
      return;
    }
    const existing = cart.find((item) => item.product_id === product.id);
    if (existing) {
      setCart(cart.map((item) => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { product_id: product.id, name: `${product.group_name || product.name} / ${product.name}`, price: Number(product.price), quantity: 1 }]);
    }
    setVariantModal(null);
  };

  const handleGroupClick = (groupKey, variants) => {
    const available = variants.filter((variant) => getRemainingStock(variant) > 0);
    if (!available.length) {
      setMessage({ type: 'warning', text: `${groupKey} is out of stock.` });
      return;
    }
    if (available.length === 1) {
      addVariantToCart(available[0]);
      return;
    }
    setVariantModal({ groupKey, variants: available });
  };

  const updateQuantity = (productId, change) => {
    setCart((prev) => prev.map((item) => item.product_id === productId ? { ...item, quantity: Math.max(1, item.quantity + change) } : item));
  };
  const setQuantity = (productId, nextQuantity) => {
    const quantity = Number(nextQuantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return removeFromCart(productId);
    setCart((prev) => prev.map((item) => item.product_id === productId ? { ...item, quantity } : item));
  };
  const removeFromCart = (productId) => setCart((prev) => prev.filter((item) => item.product_id !== productId));
  const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const applySaleToLocalStock = (soldItems) => {
    setProducts((current) => {
      const nextProducts = current.map((product) => {
        const soldItem = soldItems.find((item) => Number(item.product_id) === Number(product.id));
        return soldItem ? { ...product, stock_quantity: Math.max(0, Number(product.stock_quantity || 0) - Number(soldItem.quantity || 0)) } : product;
      });
      persistProductsCache(nextProducts);
      return nextProducts;
    });
  };

  const handleCheckout = async () => {
    if (checkoutInFlightRef.current || cart.length === 0) return;
    checkoutInFlightRef.current = true;
    setLoading(true);
    const payload = { items: cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity })), payment_method: paymentMethod };
    try {
      const response = await api.post('/sales', payload);
      setReceiptData(response.data);
      applySaleToLocalStock(payload.items);
      setCart([]);
      setMessage({ type: 'success', text: 'Sale completed.' });
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: '/sales', method: 'post', data: payload, idempotencyKey });
        applySaleToLocalStock(payload.items);
        setCart([]);
        setMessage({ type: 'warning', text: 'Offline: sale queued for sync.' });
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to complete sale.') });
      }
    } finally {
      setLoading(false);
      checkoutInFlightRef.current = false;
    }
  };

  return (
    <div className="sales-page">
      <div className="page-header"><h2>{t('newSale')}</h2></div>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="sales-layout">
        <div className="products-section">
          <div className="card"><div className="card-header"><h3>Product Groups</h3></div><div className="card-body">
            <div className="filters-row" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}><div className="search-bar" style={{ flex: 1 }}><Search size={16} /><input className="input" placeholder="Search groups or variants..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div><select className="input" style={{ maxWidth: '170px' }} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}><option value="all">All Sources</option><option value="baked">Baked</option><option value="purchased">Purchased</option></select></div>
            <div className="products-grid">
              {groupedProducts.map(([groupKey, variants]) => {
                const prices = variants.map((v) => Number(v.price || 0));
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                const totalStock = variants.reduce((sum, v) => sum + Math.max(0, getRemainingStock(v)), 0);
                const isOutOfStock = totalStock <= 0;
                return (
                  <div key={groupKey} className={`product-card ${isOutOfStock ? 'product-card-disabled' : ''}`} onClick={() => !isOutOfStock && handleGroupClick(groupKey, variants)}>
                    <div className="product-name">{groupKey}</div>
                    <div className="product-price">ETB {min === max ? min.toFixed(2) : `${min.toFixed(2)} - ${max.toFixed(2)}`}</div>
                    <div className="product-category">{variants.length} variant{variants.length > 1 ? 's' : ''}</div>
                    <div className={`product-stock ${isOutOfStock ? 'product-stock-empty' : ''}`}>{isOutOfStock ? 'Out of stock' : `${totalStock} in stock`}</div>
                  </div>
                );
              })}
            </div>
          </div></div>
        </div>

        <div className="cart-section">
          <div className="card"><div className="card-header"><h3><ShoppingCart size={20} />Cart ({cart.length})</h3></div><div className="card-body cart-body">
            {cart.length === 0 ? <div className="empty-cart"><ShoppingCart size={48} /><p>{t('cartEmpty')}</p></div> : <div className="cart-items">{cart.map((item) => <div key={item.product_id} className="cart-item"><div className="cart-item-details"><div className="cart-item-name">{item.name}</div><div className="cart-item-price">ETB {Number(item.price).toFixed(2)}</div></div><div className="cart-item-actions"><button className="btn btn-sm btn-secondary" onClick={() => updateQuantity(item.product_id, -1)}><Minus size={14} /></button><input type="number" min="1" className="form-control form-control-sm" style={{ width: '72px', textAlign: 'center' }} value={item.quantity} onChange={(e) => setQuantity(item.product_id, Number(e.target.value))} /><button className="btn btn-sm btn-secondary" onClick={() => updateQuantity(item.product_id, 1)}><Plus size={14} /></button><button className="btn btn-sm btn-danger" onClick={() => removeFromCart(item.product_id)}><Trash2 size={14} /></button></div><div className="cart-item-subtotal">ETB {(item.price * item.quantity).toFixed(2)}</div></div>)}</div>}
          </div><div className="card-footer"><div className="payment-method-select"><span>Payment:</span><select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="mobile">Mobile Banking</option></select></div><div className="cart-total"><span className="cart-total-label">Total:</span><span className="cart-total-amount">ETB {calculateTotal().toFixed(2)}</span></div><button className="btn btn-success btn-lg" onClick={handleCheckout} disabled={loading || cart.length === 0} style={{ width: '100%', marginTop: '1rem' }}>{loading ? t('processing') : isOnline ? t('completeSale') : t('queueSaleOffline')}</button></div></div>
        </div>
      </div>

      {variantModal && (
        <div className="modal-overlay" onClick={() => setVariantModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Select {variantModal.groupKey} Variant</h3><button className="close-btn" onClick={() => setVariantModal(null)}>×</button></div>
            <div className="modal-body"><div className="row g-2">{variantModal.variants.map((variant) => <div className="col-md-6" key={variant.id}><button className="btn btn-outline-primary w-100 text-start" onClick={() => addVariantToCart(variant)}><div>{variant.name}</div><small>ETB {Number(variant.price).toFixed(2)} • {getRemainingStock(variant)} left</small></button></div>)}</div></div>
          </div>
        </div>
      )}

      {receiptData && (
        <div className="modal-overlay" onClick={() => setReceiptData(null)}><div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}><div className="modal-header"><h3>Receipt</h3><button className="close-btn" onClick={() => setReceiptData(null)}>×</button></div><div className="modal-body"><p><strong>Receipt #:</strong> {receiptData.receipt_number}</p><p><strong>Date:</strong> {new Date(receiptData.sale_date || Date.now()).toLocaleString()}</p><p><strong>Payment Method:</strong> {receiptData.payment_method || paymentMethod}</p><p><strong>Total:</strong> ETB {Number(receiptData.total_amount || 0).toFixed(2)}</p></div></div></div>
      )}
    </div>
  );
}
