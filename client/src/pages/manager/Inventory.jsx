import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Package, Send, Plus, Minus } from 'lucide-react';
import './Inventory.css';
import { enqueueOperation } from '../../utils/offlineQueue';

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState({});
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchProducts();
    fetchInventory();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory');
      const inventoryMap = {};
      response.data.forEach(item => {
        inventoryMap[item.product_id] = item;
      });
      setInventory(inventoryMap);
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
    }
  };

  const addToCart = (product, source) => {
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
      setCart([]);
      fetchInventory();

      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      if (!err.response) {
        const payload = { items: cart, notes: 'Batch sent from manager' };
        const idempotencyKey = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        enqueueOperation({ url: '/inventory/batches', method: 'post', data: payload, idempotencyKey });
        setMessage({ type: 'warning', text: 'Offline: batch queued for sync.' });
        setCart([]);
      } else {
        setMessage({
          type: 'danger',
          text: err.response?.data?.error || 'Failed to send batch',
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
                      <th>Add Baked</th>
                      <th>Add Purchased</th>
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
                              onClick={() => addToCart(product, 'baked')}
                            >
                              <Plus size={16} />
                              Baked
                            </button>
                          </td>
                          <td>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => addToCart(product, 'purchased')}
                            >
                              <Plus size={16} />
                              Purchased
                            </button>
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
                  {cart.map((item, idx) => (
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
