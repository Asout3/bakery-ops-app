import { useState, useEffect, useRef, useMemo } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';
import { Plus, Minus, ShoppingCart, Trash2, Search } from 'lucide-react';
import './Sales.css';
import { enqueueOperation, listQueuedOperations } from '../../utils/offlineQueue';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import ReceiptPreview from '../../receipts/ReceiptPreview';
import {
  generateClientTransactionId,
  generateReceiptNumber,
  getDeviceProfile,
  getReceiptConfigCache,
  normalizeReceiptSettings,
  normalizeReceiptTemplate,
  persistReceiptConfigCache,
  resolveInclusiveTaxTotals,
} from '../../receipts/helpers';
import { markReceiptPrintCancelled, performReceiptPrint } from '../../receipts/printService';
import { saveLocalReceiptRecord } from '../../receipts/storage';

function buildOfflineReceiptSale({ payload, cart, paymentMethod, user, settings, activeTemplate }) {
  const now = new Date().toISOString();
  const totals = cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
  const header = activeTemplate.schema.sections.header;
  const phoneLines = String(header.phone || '').split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean);
  const taxTotals = resolveInclusiveTaxTotals(
    totals,
    Number(header.taxPercent || 0),
    Boolean(activeTemplate.schema.sections.totals.showTax)
  );
  return {
    id: null,
    local_only: true,
    queued_for_sync: true,
    client_transaction_id: payload.client_transaction_id,
    receipt_number: payload.receipt_number,
    sale_date: now,
    payment_method: paymentMethod,
    cashier_name: user?.username || 'Cashier',
    status: 'completed',
    is_offline: true,
    items: cart.map((item) => ({ product_id: item.product_id, product_name: item.name, quantity: item.quantity, unit_price: Number(item.price), subtotal: Number(item.price) * Number(item.quantity) })),
    receipt_template_snapshot: activeTemplate.schema,
    receipt_payload: {
      receipt_number: payload.receipt_number,
      sale_date: now,
      payment_method: paymentMethod,
      cashier_name: user?.username || 'Cashier',
      header_lines: [header.businessName, header.branchName, header.slogan, header.address, ...phoneLines].filter(Boolean),
      currency_code: activeTemplate.schema.sections.transaction.currencyCode || 'ETB',
      decimals: Number(activeTemplate.schema.sections.transaction.decimals ?? 2),
      items: cart.map((item) => ({ product_id: item.product_id, product_name: item.name, quantity: item.quantity, unit_price: Number(item.price), subtotal: Number(item.price) * Number(item.quantity) })),
      totals: { subtotal: taxTotals.subtotal, tax: taxTotals.tax, discounts: 0, serviceCharge: 0, total: taxTotals.total, paidAmount: taxTotals.total, change: 0 },
      footer_text: activeTemplate.schema.sections.footer.footerText || '',
      website: activeTemplate.schema.sections.footer.website || '',
    },
    print_summary: {
      receipt_generated: true,
      printed: false,
      print_attempts: 0,
      last_print_result: 'unprinted',
      reprint_count: 0,
      reprints_remaining: Number(settings.reprintPolicy.maxManualReprints || 2),
      in_reprint_window: true,
      print_events: [],
    },
    settings,
  };
}

export default function Sales() {
  const { selectedLocationId } = useBranch();
  const { user } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [receiptData, setReceiptData] = useState(null);
  const [variantModal, setVariantModal] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [receiptConfig, setReceiptConfig] = useState(() => getReceiptConfigCache() || {
    settings: normalizeReceiptSettings({}),
    activeTemplate: { id: 'default', name: 'Classic thermal', schema: normalizeReceiptTemplate({}) },
  });
  const [pendingPrintSale, setPendingPrintSale] = useState(null);
  const [printFailure, setPrintFailure] = useState(null);
  const checkoutInFlightRef = useRef(false);

  const persistProductsCache = (nextProducts) => localStorage.setItem(`cashier_products_cache_${selectedLocationId || 'default'}`, JSON.stringify(nextProducts));

  const applyPendingSalesToProducts = async (baseProducts) => {
    const queue = await listQueuedOperations();
    const pendingSales = queue.filter((op) => op.url === '/sales'
      && op.method === 'post'
      && op.status === 'pending'
      && String(op.headers?.['X-Location-Id'] || '') === String(selectedLocationId || ''));
    if (!pendingSales.length) return baseProducts;
    const usageByProduct = new Map();
    pendingSales.forEach((op) => (op.data?.items || []).forEach((item) => usageByProduct.set(Number(item.product_id), (usageByProduct.get(Number(item.product_id)) || 0) + Number(item.quantity || 0))));
    return baseProducts.map((product) => ({ ...product, stock_quantity: Math.max(0, Number(product.stock_quantity || 0) - (usageByProduct.get(Number(product.id)) || 0)) }));
  };

  const fetchReceiptConfig = async () => {
    try {
      const response = await api.get('/sales/receipt-config');
      const config = {
        settings: normalizeReceiptSettings(response.data.settings || {}),
        activeTemplate: response.data.activeTemplate ? { ...response.data.activeTemplate, schema: normalizeReceiptTemplate(response.data.activeTemplate.schema || {}) } : { id: 'default', name: 'Classic thermal', schema: normalizeReceiptTemplate({}) },
      };
      setReceiptConfig(config);
      persistReceiptConfigCache(config);
    } catch {}
  };

  const fetchProducts = async () => {
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
        toast.warning('Offline mode: using cached products.');
      }
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchReceiptConfig();
  }, [selectedLocationId]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      fetchProducts();
      fetchReceiptConfig();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [selectedLocationId]);

  useEffect(() => {
    const handleOfflineQueueSynced = () => {
      fetchProducts();
    };

    window.addEventListener('offline-queue-synced', handleOfflineQueueSynced);
    return () => {
      window.removeEventListener('offline-queue-synced', handleOfflineQueueSynced);
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
  const resetQuantityDraft = (productId, fallbackValue) => {
    setQuantityDrafts((current) => ({ ...current, [productId]: String(fallbackValue) }));
  };

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
      if (nextQty > maxQty) {
        resetQuantityDraft(productId, item.quantity);
        toast.warning('Out of stock');
        return item;
      }
      return { ...item, quantity: nextQty };
    }));
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  };

  const setQuantity = (productId, nextQuantity) => {
    const quantity = Number(nextQuantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Quantity must be greater than zero. Use Delete to remove an item.');
      return;
    }

    const product = products.find((p) => Number(p.id) === Number(productId));
    const maxQty = Number(product?.stock_quantity || 0);
    if (quantity > maxQty) {
      const currentQuantity = cart.find((item) => Number(item.product_id) === Number(productId))?.quantity || 1;
      resetQuantityDraft(productId, currentQuantity);
      toast.warning('Out of stock');
      return;
    }

    setCart((prev) => prev.map((item) => (item.product_id === productId ? { ...item, quantity } : item)));
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  };

  const handleQuantityDraftChange = (productId, rawValue) => {
    const normalized = String(rawValue ?? '').replace(/[^\d]/g, '');
    if (!normalized) {
      setQuantityDrafts((current) => ({ ...current, [productId]: '' }));
      return;
    }
    const product = products.find((p) => Number(p.id) === Number(productId));
    const maxQty = Math.max(1, Number(product?.stock_quantity || 0));
    const clamped = Math.min(maxQty, Math.max(1, Number(normalized)));
    setQuantityDrafts((current) => ({ ...current, [productId]: String(clamped) }));
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
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

  const resolveSaleForPrinting = (sale) => saveLocalReceiptRecord({ ...sale, location_id: sale.location_id || selectedLocationId || null, settings: receiptConfig.settings });

  const maybeStartPrintFlow = async (sale) => {
    const activeSettings = receiptConfig.settings;
    if (activeSettings.enabled === false) {
      return;
    }
    if (activeSettings.printMode === 'ask') {
      setPendingPrintSale(sale);
      return;
    }
    try {
      await performReceiptPrint({
        sale,
        template: receiptConfig.activeTemplate.schema,
        settings: activeSettings,
        adapterMode: activeSettings.printerProfile.saleAdapter || 'browser',
        attemptType: 'original',
      });
      toast.success('Receipt print started.');
      if (activeSettings.showReceiptAfterSale) {
        setReceiptData(resolveSaleForPrinting({ ...sale, print_summary: { ...(sale.print_summary || {}), printed: true, last_print_result: 'success' } }));
      }
    } catch (error) {
      setPrintFailure({ sale, message: error.message || 'Printing failed.' });
      if (activeSettings.showReceiptAfterSale) {
        setReceiptData(resolveSaleForPrinting(sale));
      }
    }
  };

  const handleCheckout = async () => {
    if (checkoutInFlightRef.current || cart.length === 0) return;
    const adjustedCart = [];
    let hasStockConflict = false;
    for (const item of cart) {
      const product = products.find((entry) => Number(entry.id) === Number(item.product_id));
      const maxQty = Math.max(0, Number(product?.stock_quantity || 0));
      if (maxQty <= 0) {
        hasStockConflict = true;
        continue;
      }
      if (Number(item.quantity) > maxQty) {
        hasStockConflict = true;
        adjustedCart.push({ ...item, quantity: maxQty });
        continue;
      }
      adjustedCart.push(item);
    }
    if (hasStockConflict) {
      setCart(adjustedCart);
      setQuantityDrafts({});
      toast.warning('Out of stock');
      return;
    }
    checkoutInFlightRef.current = true;
    setLoading(true);

    const device = getDeviceProfile();
    const clientTransactionId = generateClientTransactionId();
    const receiptNumber = generateReceiptNumber();
    const payload = {
      items: cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      payment_method: paymentMethod,
      client_transaction_id: clientTransactionId,
      receipt_number: receiptNumber,
      receipt_context: {
        device_id: device.deviceId,
        device_label: device.deviceLabel,
        created_at: new Date().toISOString(),
      },
      receipt_template_snapshot: receiptConfig.activeTemplate.schema,
      receipt_enabled: receiptConfig.settings.enabled !== false,
    };

    try {
      const response = await api.post('/sales', payload);
      const completedSale = resolveSaleForPrinting({ ...response.data, client_transaction_id: response.data.client_transaction_id || clientTransactionId });
      if (receiptConfig.settings.enabled !== false && receiptConfig.settings.showReceiptAfterSale) {
        setReceiptData(completedSale);
      }
      applySaleToLocalStock(payload.items);
      setCart([]);
      toast.success('Sale completed.');
      void fetchProducts();
      void maybeStartPrintFlow(completedSale);
    } catch (err) {
      if (!err.response) {
        const idempotencyKey = `sale-${clientTransactionId}`;
        await enqueueOperation({ url: '/sales', method: 'post', data: payload, idempotencyKey });
        applySaleToLocalStock(payload.items);
        const offlineSale = buildOfflineReceiptSale({ payload, cart, paymentMethod, user, settings: receiptConfig.settings, activeTemplate: receiptConfig.activeTemplate });
        const storedOfflineSale = resolveSaleForPrinting(offlineSale);
        if (receiptConfig.settings.enabled !== false && receiptConfig.settings.showReceiptAfterSale) {
          setReceiptData(storedOfflineSale);
        }
        setCart([]);
        toast.info('Sale queued offline and will sync automatically when online.');
        void maybeStartPrintFlow(storedOfflineSale);
      } else {
        toast.error(getErrorMessage(err, 'Failed to complete sale.'));
      }
    } finally {
      setLoading(false);
      checkoutInFlightRef.current = false;
    }
  };

  const handleAskPrint = async (shouldPrint) => {
    if (!pendingPrintSale) return;
    if (!shouldPrint) {
      await markReceiptPrintCancelled({ sale: pendingPrintSale, attemptType: 'original', adapterMode: receiptConfig.settings.printerProfile.saleAdapter || 'browser' });
      toast.info('Sale completed without printing.');
      setPendingPrintSale(null);
      return;
    }
    try {
      await performReceiptPrint({
        sale: pendingPrintSale,
        template: receiptConfig.activeTemplate.schema,
        settings: receiptConfig.settings,
        adapterMode: receiptConfig.settings.printerProfile.saleAdapter || 'browser',
        attemptType: 'original',
      });
      toast.success('Receipt print started.');
      setPendingPrintSale(null);
    } catch (error) {
      setPrintFailure({ sale: pendingPrintSale, message: error.message || 'Printing failed.' });
      setPendingPrintSale(null);
    }
  };

  const handleRetryPrint = async () => {
    if (!printFailure?.sale) return;
    try {
      await performReceiptPrint({
        sale: printFailure.sale,
        template: receiptConfig.activeTemplate.schema,
        settings: receiptConfig.settings,
        adapterMode: receiptConfig.settings.printerProfile.saleAdapter || 'browser',
        attemptType: 'original',
      });
      toast.success('Receipt print started.');
      setPrintFailure(null);
    } catch (error) {
      setPrintFailure({ sale: printFailure.sale, message: error.message || 'Printing failed.' });
    }
  };

  const handleCancelPrintFailure = async () => {
    if (printFailure?.sale) {
      await markReceiptPrintCancelled({ sale: printFailure.sale, attemptType: 'original', adapterMode: receiptConfig.settings.printerProfile.saleAdapter || 'browser' });
    }
    setPrintFailure(null);
  };

  return (
    <div className="sales-page">
      <div className="page-header"><h2>{t('newSale')}</h2></div>
      <div className="sales-layout">
        <div className="products-section">
          <div className="card"><div className="card-header"><h3>Product Groups</h3></div><div className="card-body">
            <div className="filters-row" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}><div className="search-bar" style={{ flex: 1 }}><Search size={16} /><input className="input" placeholder="Search groups or variants..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div><select className="input" style={{ maxWidth: '170px' }} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}><option value="all">All Sources</option><option value="baked">Baked</option><option value="purchased">Purchased</option></select><select className="input" style={{ maxWidth: '200px' }} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}><option value="all">All Groups</option>{Array.from(new Set(products.filter((p) => p.is_active !== false).map((p) => p.group_name || p.name))).sort().map((group) => <option key={group} value={group}>{group}</option>)}</select><select className="input" style={{ maxWidth: '200px' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">All Categories</option>{Array.from(new Set(products.filter((p) => p.is_active !== false).map((p) => p.category_name || 'Uncategorized'))).sort().map((category) => <option key={category} value={category}>{category}</option>)}</select><button className="btn btn-outline-secondary" type="button" onClick={() => { setSearchTerm(''); setSourceFilter('all'); setGroupFilter('all'); setCategoryFilter('all'); }}>Reset Filters</button></div>
            <div className="products-grid">
              {groupedProducts.map(([groupKey, variants]) => {
                const prices = variants.map((v) => Number(v.price || 0));
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                const totalStock = variants.reduce((sum, v) => sum + Math.max(0, getRemainingStock(v)), 0);
                const isOutOfStock = totalStock <= 0;
                return (
                  <div key={groupKey} className={`product-card ${isOutOfStock ? 'product-card-disabled' : ''}`} onClick={() => handleGroupClick(groupKey, variants)}>
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
            {cart.length === 0 ? <div className="empty-cart"><ShoppingCart size={48} /><p>{t('cartEmpty')}</p></div> : <div className="cart-items">{cart.map((item) => <div key={item.product_id} className="cart-item"><div className="cart-item-details"><div className="cart-item-name">{item.name}</div><div className="cart-item-price">ETB {Number(item.price).toFixed(2)}</div></div><div className="cart-item-actions"><button className="btn btn-sm btn-secondary" onClick={() => updateQuantity(item.product_id, -1)}><Minus size={14} /></button><input type="number" min="1" max={Math.max(1, Number(products.find((p) => Number(p.id) === Number(item.product_id))?.stock_quantity || 0))} className="form-control form-control-sm" style={{ width: '72px', textAlign: 'center' }} value={quantityDrafts[item.product_id] ?? String(item.quantity)} onChange={(e) => handleQuantityDraftChange(item.product_id, e.target.value)} onBlur={(e) => setQuantity(item.product_id, e.target.value)} /><button className="btn btn-sm btn-secondary" onClick={() => updateQuantity(item.product_id, 1)}><Plus size={14} /></button><button className="btn btn-sm btn-danger" onClick={() => removeFromCart(item.product_id)}><Trash2 size={14} /></button></div><div className="cart-item-subtotal">ETB {(item.price * item.quantity).toFixed(2)}</div></div>)}</div>}
          </div><div className="card-footer"><div className="payment-method-select"><label htmlFor="payment-method">Payment Method</label><select id="payment-method" className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="mobile">Mobile Banking</option><option value="telebirr">Telebirr</option></select></div><div className="cart-total"><span className="cart-total-label">Total:</span><span className="cart-total-amount">ETB {calculateTotal().toFixed(2)}</span></div><button className="btn btn-success btn-lg" onClick={handleCheckout} disabled={loading || cart.length === 0} style={{ width: '100%', marginTop: '1rem' }}>{loading ? t('processing') : isOnline ? t('completeSale') : t('queueSaleOffline')}</button></div></div>
        </div>
      </div>

      {variantModal && (
        <div className="modal-overlay" onClick={() => setVariantModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Select {variantModal.groupKey} Variant</h3><button className="close-btn" onClick={() => setVariantModal(null)}>×</button></div>
            <div className="modal-body">
              <div className="variant-grid">
                {variantModal.variants.map((variant) => {
                  const remaining = getRemainingStock(variant);
                  const outOfStock = remaining <= 0;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      className={`variant-option ${outOfStock ? 'variant-option-disabled' : ''}`}
                      onClick={() => addVariantToCart(variant)}
                      disabled={outOfStock}
                    >
                      <div className="variant-option-name">{variant.name}</div>
                      <div className="variant-option-meta">ETB {Number(variant.price).toFixed(2)} • {outOfStock ? 'Out of stock' : `${remaining} left`}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {receiptData && (
        <div className="modal-overlay" onClick={() => setReceiptData(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Receipt</h3><button className="close-btn" onClick={() => setReceiptData(null)}>×</button></div>
            <div className="modal-body d-flex justify-content-center">
              <ReceiptPreview sale={receiptData} template={receiptConfig.activeTemplate.schema} settings={receiptConfig.settings} />
            </div>
          </div>
        </div>
      )}

      {pendingPrintSale && (
        <div className="modal-overlay" onClick={() => setPendingPrintSale(null)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Print receipt now?</h3><button className="close-btn" onClick={() => setPendingPrintSale(null)}>×</button></div>
            <div className="modal-body">
              <p>Sale {pendingPrintSale.receipt_number} is complete. Print the thermal receipt now?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => handleAskPrint(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleAskPrint(true)}>Print Receipt</button>
            </div>
          </div>
        </div>
      )}

      {printFailure && (
        <div className="modal-overlay" onClick={() => setPrintFailure(null)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Receipt printing failed</h3><button className="close-btn" onClick={() => setPrintFailure(null)}>×</button></div>
            <div className="modal-body">
              <p>{printFailure.message}</p>
              <p className="text-muted mb-0">The sale remains completed. You can retry printing or continue and leave it marked unprinted.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCancelPrintFailure}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRetryPrint}>Retry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
