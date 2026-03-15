import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('orders route includes product_name for order item payloads', async () => {
  const source = await fs.readFile('server/routes/orders.js', 'utf8');
  assert.match(source, /p\.name\s+AS\s+product_name/, 'orders route should select product_name from products table');
  assert.match(source, /WHERE oi\.order_id = \$1/, 'single-order items query should use explicit oi.order_id filter');
  assert.match(source, /WHERE oi\.order_id = ANY\(\$1::int\[\]\)/, 'multi-order items query should use explicit oi.order_id array filter');
});

test('manager inventory page exposes stock filters and safe empty state', async () => {
  const source = await fs.readFile('client/src/pages/manager/Inventory.jsx', 'utf8');
  assert.match(source, /const \[stockFilter, setStockFilter\] = useState\('all'\)/, 'inventory page should keep a stock filter state');
  assert.match(source, /Low Stock \(\{stockCounts\.low\}\)/, 'inventory page should show low stock count in filter UI');
  assert.match(source, /Out of Stock \(\{stockCounts\.out\}\)/, 'inventory page should show out-of-stock count in filter UI');
  assert.match(source, /No products match the selected filters\./, 'inventory page should render an explicit empty filtered-state message');
});
