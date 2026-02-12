import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Plus, Minus, ShoppingCart, Trash2, Search } from 'lucide-react';
import './Sales.css';
import { enqueueOperation } from '../../utils/offlineQueue';

export default function Sales() {
  const { selectedLocationId } = useBranch();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [orderStartedAt, setOrderStartedAt] = useState(Date.now());

  useEffect(() => {
    fetchProducts();
  }, [selectedLocationId]);

  const fetchProducts = async () => {
    try {
      const [productsRes, inventoryRes] = await Promise.all([api.get('/products'), api.get('/inventory')]);
      const availableIds = new Set((inventoryRes.data || []).filter((it) => Number(it.quantity) > 0).map((it) => Number(it.product_id)));
      setProducts((productsRes.data || []).filter((p) => availableIds.has(Number(p.id))));
    } catch (err) {
      console.error('Failed to fetch products:', err);
    }
  };

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (product) => {
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
    setCart(cart.map((item) => {
      if (item.product_id === productId) {
        const newQty = item.quantity + change;
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
    if (cart.length === 0) {
      setMessage({ type: 'warning', text: 'Cart is empty' });
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/sales', {
        items: cart.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        })),
        payment_method: 'cash',
        cashier_timing_ms: Date.now() - orderStartedAt
      });

      setMessage({ 
        type: 'success', 
        text: `Sale completed! Receipt: ${response.data.receipt_number}` 
      });
      setCart([]);
      setOrderStartedAt(Date.now());
      
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      if (!err.response) {
        const payload = {
          items: cart.map(item => ({ product_id: item.product_id, quantity: item.quantity })),
          payment_method: 'cash',
          cashier_timing_ms: Date.now() - orderStartedAt
        };
        const idempotencyKey = `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: '/sales', method: 'post', data: payload, idempotencyKey });
        setMessage({ type: 'warning', text: 'Offline: sale queued for sync.' });
        setCart([]);
        setOrderStartedAt(Date.now());
      } else {
        setMessage({ 
          type: 'danger', 
          text: err.response?.data?.error || 'Failed to process sale' 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sales-page">
      <div className="sales-header">
        <h2>New Sale</h2>
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
              <div
                key={product.id}
                className="product-card"
                onClick={() => addToCart(product)}
              >
                <div className="product-name">{product.name}</div>
                <div className="product-price">${Number(product.price).toFixed(2)}</div>
                <div className="product-category">{product.category_name}</div>
              </div>
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
                  <p>Cart is empty</p>
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
                        ${(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-footer">
              <div className="cart-total">
                <span className="cart-total-label">Total:</span>
                <span className="cart-total-amount">
                  ${calculateTotal().toFixed(2)}
                </span>
              </div>
              <button
                className="btn btn-success btn-lg"
                onClick={handleCheckout}
                disabled={loading || cart.length === 0}
                style={{ width: '100%', marginTop: '1rem' }}
              >
                {loading ? 'Processing...' : 'Complete Sale'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
