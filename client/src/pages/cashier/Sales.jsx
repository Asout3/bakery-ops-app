import { useState, useEffect, useRef, useMemo } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Plus, Minus, ShoppingCart, Trash2, Search, Filter, RotateCcw, ChevronRight } from 'lucide-react';
import { enqueueOperation, listQueuedOperations } from '../../utils/offlineQueue';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import './Sales.css';

export default function Sales() {
  const { selectedLocationId } = useBranch();
  const { t } = useLanguage();
  const toast = useToast();

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [receiptData, setReceiptData] = useState(null);
  const [variantModal, setVariantModal] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const checkoutInFlightRef = useRef(false);

  const persistProductsCache = (nextProducts) => localStorage.setItem(`cashier_products_cache_${selectedLocationId || 'default'}`, JSON.stringify(nextProducts));

  const applyPendingSalesToProducts = async (baseProducts) => {
    const queue = await listQueuedOperations();
    const pendingSales = queue.filter((op) => op.url === '/sales' && op.method === 'post' && op.status !== 'conflict');
    if (!pendingSales.length) return baseProducts;
    const usageByProduct = new Map();
    pendingSales.forEach((op) => (op.data?.items || []).forEach((item) => usageByProduct.set(Number(item.product_id), (usageByProduct.get(Number(item.product_id)) || 0) + Number(item.quantity || 0))));
    return baseProducts.map((product) => ({ ...product, stock_quantity: Math.max(0, Number(product.stock_quantity || 0) - (usageByProduct.get(Number(product.id)) || 0)) }));
  };

  const fetchProducts = useCallback(async () => {
    setFetching(true);
    try {
      const [productsRes, inventoryRes] = await Promise.all([api.get('/products'), api.get('/inventory')]);
      const inventoryByProduct = new Map((inventoryRes.data || []).map((it) => [Number(it.product_id), Number(it.quantity) || 0]));
      const productsWithStock = (productsRes.data || []).map((product) => ({ ...product, stock_quantity: inventoryByProduct.get(Number(product.id)) || 0 }));
      const productsWithPendingApplied = await applyPendingSalesToProducts(productsWithStock);
      setProducts(productsWithPendingApplied);
      persistProductsCache(productsWithPendingApplied);
    } catch {
      const cached = localStorage.getItem(`cashier_products_cache_${selectedLocationId || 'default'}`);
      if (cached) {
        setProducts(JSON.parse(cached));
        toast.info('Offline mode: using cached products.');
      } else {
        toast.error('Failed to load products.');
      }
    } finally {
      setFetching(false);
    }
  }, [selectedLocationId, toast]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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
  }, [selectedLocationId]);

  const groupedProducts = useMemo(() => {
    const map = new Map();
    products
      .filter((product) => {
        const groupKey = product.group_name || product.name;
        const matchesSearch = `${groupKey} ${product.name}`.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSource = sourceFilter === 'all' || (product.source || 'baked') === sourceFilter;
        const matchesGroup = groupFilter === 'all' || groupKey === groupFilter;
        const matchesCategory = categoryFilter === 'all' || String(product.category_name || 'Uncategorized') === categoryFilter;
        return product.is_active !== false && matchesSearch && matchesSource && matchesGroup && matchesCategory;
      })
      .forEach((product) => {
        const key = product.group_name || product.name;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(product);
      });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products, searchTerm, sourceFilter, groupFilter, categoryFilter]);

  const getCartQuantity = (productId) => cart.find((item) => item.product_id === productId)?.quantity || 0;
  const getRemainingStock = (product) => Math.max(0, Number(product.stock_quantity || 0) - getCartQuantity(product.id));

  const addVariantToCart = (product) => {
    if (getRemainingStock(product) <= 0) {
      toast.warning(`${product.name} is out of stock.`);
      return;
    }

    const existing = cart.find((item) => item.product_id === product.id);
    if (existing) {
      setCart((current) => current.map((item) => (item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item)));
    } else {
      setCart((current) => ([...current, { product_id: product.id, name: `${product.group_name || product.name} / ${product.name}`, price: Number(product.price), quantity: 1 }]));
    }

    setVariantModal(null);
    toast.success(`${product.name} added to cart.`);
  };

  const handleGroupClick = (groupKey, variants) => {
    if (variants.length === 1) {
      addVariantToCart(variants[0]);
      return;
    }
    setVariantModal({ groupKey, variants });
  };

  const updateQuantity = (productId, change) => {
    setCart((prev) => prev.map((item) => {
      if (item.product_id !== productId) return item;
      const product = products.find((p) => Number(p.id) === Number(productId));
      const maxQty = Number(product?.stock_quantity || 0);
      const nextQty = Math.max(1, item.quantity + change);
      if (maxQty > 0 && nextQty > maxQty) {
        toast.warning(`${product?.name || 'Item'} is out of stock.`);
        return item;
      }
      return { ...item, quantity: nextQty };
    }));
  };

  const setQuantity = (productId, nextQuantity) => {
    const quantity = Number(nextQuantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return removeFromCart(productId);

    const product = products.find((p) => Number(p.id) === Number(productId));
    const maxQty = Number(product?.stock_quantity || 0);
    if (maxQty > 0 && quantity > maxQty) {
      toast.warning(`${product?.name || 'Item'} is out of stock.`);
      return;
    }

    setCart((prev) => prev.map((item) => (item.product_id === productId ? { ...item, quantity } : item)));
  };

  const removeFromCart = (productId) => {
    const item = cart.find(i => i.product_id === productId);
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
    if (item) toast.info(`${item.name} removed from cart.`);
  };

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
      toast.success('Sale completed successfully.');
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: '/sales', method: 'post', data: payload, idempotencyKey });
        applySaleToLocalStock(payload.items);
        setCart([]);
        toast.warning('Offline: sale queued for sync.');
      } else {
        toast.error(getErrorMessage(err, 'Failed to complete sale.'));
      }
    } finally {
      setLoading(false);
      checkoutInFlightRef.current = false;
    }
  };

  return (
    <div className="sales-page animate-fade-in">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem' }}>{t('newSale')}</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
           <Badge variant={isOnline ? 'success' : 'warning'}>
             {isOnline ? 'Online' : 'Offline Mode'}
           </Badge>
        </div>
      </div>

      <div className="sales-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '1.5rem', alignItems: 'start' }}>
        <div className="products-section">
          <Card>
            <CardHeader style={{ padding: '1rem 1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      className="input-field"
                      placeholder="Search items..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{ paddingLeft: '2.75rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select className="input-field" style={{ width: '140px' }} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                      <option value="all">All Sources</option>
                      <option value="baked">Baked</option>
                      <option value="purchased">Purchased</option>
                    </select>
                    <Button variant="secondary" onClick={() => { setSearchTerm(''); setSourceFilter('all'); setGroupFilter('all'); setCategoryFilter('all'); }}>
                      <RotateCcw size={18} />
                    </Button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', whiteSpace: 'nowrap' }}>
                   <button
                     onClick={() => setCategoryFilter('all')}
                     style={{
                       padding: '0.5rem 1rem',
                       borderRadius: '999px',
                       border: '1px solid',
                       borderColor: categoryFilter === 'all' ? 'var(--button-end)' : 'var(--input-border)',
                       background: categoryFilter === 'all' ? 'rgba(244, 162, 97, 0.1)' : 'transparent',
                       color: categoryFilter === 'all' ? 'var(--button-end)' : 'var(--text-secondary)',
                       fontWeight: 600,
                       fontSize: '0.8125rem',
                       cursor: 'pointer'
                     }}
                   >
                     All Categories
                   </button>
                   {Array.from(new Set(products.filter(p => p.is_active !== false).map(p => p.category_name || 'Uncategorized'))).sort().map(cat => (
                     <button
                       key={cat}
                       onClick={() => setCategoryFilter(cat)}
                       style={{
                         padding: '0.5rem 1rem',
                         borderRadius: '999px',
                         border: '1px solid',
                         borderColor: categoryFilter === cat ? 'var(--button-end)' : 'var(--input-border)',
                         background: categoryFilter === cat ? 'rgba(244, 162, 97, 0.1)' : 'transparent',
                         color: categoryFilter === cat ? 'var(--button-end)' : 'var(--text-secondary)',
                         fontWeight: 600,
                         fontSize: '0.8125rem',
                         cursor: 'pointer'
                       }}
                     >
                       {cat}
                     </button>
                   ))}
                </div>
              </div>
            </CardHeader>
            <CardBody style={{ minHeight: '60vh', padding: '1.5rem' }}>
              {fetching ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.25rem' }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} height="140px" />)}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.25rem' }}>
                  {groupedProducts.map(([groupKey, variants]) => {
                    const prices = variants.map((v) => Number(v.price || 0));
                    const min = Math.min(...prices);
                    const max = Math.max(...prices);
                    const totalStock = variants.reduce((sum, v) => sum + Math.max(0, getRemainingStock(v)), 0);
                    const isOutOfStock = totalStock <= 0;

                    return (
                      <div
                        key={groupKey}
                        onClick={() => !isOutOfStock && handleGroupClick(groupKey, variants)}
                        className={`product-card ${isOutOfStock ? 'disabled' : ''}`}
                        style={{
                          background: 'var(--surface-bg)',
                          border: '1px solid var(--accent-border)',
                          borderRadius: 'var(--radius)',
                          padding: '1.25rem',
                          cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          opacity: isOutOfStock ? 0.6 : 1,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                          position: 'relative',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', minHeight: '2.5rem' }}>{groupKey}</div>
                        <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--button-end)' }}>
                          ETB {min === max ? min.toFixed(2) : `${min.toFixed(2)}+`}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{variants.length} types</span>
                          <Badge variant={isOutOfStock ? 'danger' : totalStock < 10 ? 'warning' : 'success'}>
                            {isOutOfStock ? 'Sold Out' : `${totalStock} in stock`}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                  {groupedProducts.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem' }}>
                       <Search size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                       <h3 style={{ color: 'var(--text-muted)' }}>No products found</h3>
                       <p>Try adjusting your search or filters.</p>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="cart-section" style={{ position: 'sticky', top: '90px' }}>
          <Card style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-md)' }}>
            <CardHeader style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.125rem' }}>
                <ShoppingCart size={20} />
                {t('cartEmpty').replace('is empty', '')} ({cart.length})
              </h3>
              {cart.length > 0 && <Button variant="ghost" size="sm" onClick={() => setCart([])}><Trash2 size={16} /></Button>}
            </CardHeader>
            <CardBody style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
              {cart.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)', gap: '1rem' }}>
                  <ShoppingCart size={64} style={{ opacity: 0.2 }} />
                  <p>{t('cartEmpty')}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {cart.map((item) => (
                    <div key={item.product_id} style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--accent-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                         <div style={{ fontWeight: 600, fontSize: '0.9375rem', flex: 1, paddingRight: '0.5rem' }}>{item.name}</div>
                         <div style={{ fontWeight: 800 }}>ETB {(item.price * item.quantity).toFixed(2)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--input-border)', padding: '0.25rem' }}>
                          <button onClick={() => updateQuantity(item.product_id, -1)} style={{ background: 'transparent', border: 'none', padding: '0.25rem', cursor: 'pointer' }}><Minus size={14} /></button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => setQuantity(item.product_id, Number(e.target.value))}
                            style={{ width: '40px', border: 'none', background: 'transparent', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem' }}
                          />
                          <button onClick={() => updateQuantity(item.product_id, 1)} style={{ background: 'transparent', border: 'none', padding: '0.25rem', cursor: 'pointer' }}><Plus size={14} /></button>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@ ETB {item.price.toFixed(2)}</span>
                        <button onClick={() => removeFromCart(item.product_id)} style={{ marginLeft: 'auto', color: 'var(--text-error)', background: 'transparent', border: 'none', cursor: 'pointer' }}><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
            <CardFooter style={{ padding: '1.5rem', background: 'rgba(95, 58, 36, 0.02)' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Payment Method</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['cash', 'mobile', 'telebirr'].map(method => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid',
                        borderColor: paymentMethod === method ? 'var(--button-end)' : 'var(--input-border)',
                        background: paymentMethod === method ? 'rgba(244, 162, 97, 0.1)' : 'var(--card-bg)',
                        color: paymentMethod === method ? 'var(--button-end)' : 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        cursor: 'pointer'
                      }}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '1.125rem', fontWeight: 600 }}>Total</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>ETB {calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <Button
                variant="primary"
                size="lg"
                style={{ width: '100%', height: '3.5rem', fontSize: '1.125rem' }}
                onClick={handleCheckout}
                isLoading={loading}
                disabled={cart.length === 0}
              >
                {!isOnline && <ShoppingCart size={20} style={{ marginRight: '0.5rem' }} />}
                {loading ? t('processing') : isOnline ? t('completeSale') : t('queueSaleOffline')}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={!!variantModal}
        onClose={() => setVariantModal(null)}
        title={`Select ${variantModal?.groupKey} Variant`}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {variantModal?.variants.map((variant) => {
            const remaining = getRemainingStock(variant);
            const outOfStock = remaining <= 0;
            return (
              <button
                key={variant.id}
                onClick={() => addVariantToCart(variant)}
                disabled={outOfStock}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1.25rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--input-border)',
                  background: 'var(--surface-bg)',
                  cursor: outOfStock ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  opacity: outOfStock ? 0.5 : 1
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>{variant.name}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{outOfStock ? 'Out of stock' : `${remaining} available`}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                   <div style={{ fontWeight: 800, color: 'var(--button-end)' }}>ETB {Number(variant.price).toFixed(2)}</div>
                   <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            );
          })}
        </div>
      </Modal>

      <Modal
        isOpen={!!receiptData}
        onClose={() => setReceiptData(null)}
        title="Sale Completed"
        size="sm"
      >
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
           <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success-text)', display: 'grid', placeItems: 'center', margin: '0 auto 1.5rem' }}>
             <ShoppingCart size={32} />
           </div>
           <h3 style={{ marginBottom: '1.5rem' }}>Receipt Info</h3>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left', background: 'var(--surface-bg)', padding: '1.5rem', borderRadius: 'var(--radius)', border: '1px dashed var(--input-border)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span style={{ color: 'var(--text-muted)' }}>Receipt #:</span>
               <span style={{ fontWeight: 700 }}>{receiptData?.receipt_number}</span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span style={{ color: 'var(--text-muted)' }}>Date:</span>
               <span style={{ fontWeight: 600 }}>{new Date(receiptData?.sale_date || Date.now()).toLocaleString()}</span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span style={{ color: 'var(--text-muted)' }}>Payment:</span>
               <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{receiptData?.payment_method || paymentMethod}</span>
             </div>
             <div style={{ height: '1px', background: 'var(--accent-border)', margin: '0.5rem 0' }}></div>
             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem' }}>
               <span style={{ fontWeight: 700 }}>Total:</span>
               <span style={{ fontWeight: 900, color: 'var(--button-end)' }}>ETB {Number(receiptData?.total_amount || 0).toFixed(2)}</span>
             </div>
           </div>
           <Button variant="primary" style={{ width: '100%', marginTop: '2rem' }} onClick={() => setReceiptData(null)}>
             Done
           </Button>
        </div>
      </Modal>
    </div>
  );
}
