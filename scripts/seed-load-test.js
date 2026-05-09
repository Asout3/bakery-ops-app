import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const SCALE = Number(process.env.LOAD_SEED_SCALE || 1);
const COUNTS = {
  products: Math.max(500, Math.trunc(5000 * SCALE)),
  staff: Math.max(10, Math.trunc(120 * SCALE)),
  inventoryRows: Math.max(1000, Math.trunc(40000 * SCALE)),
  sales: Math.max(1000, Math.trunc(120000 * SCALE)),
  orders: Math.max(1000, Math.trunc(60000 * SCALE)),
  expenses: Math.max(500, Math.trunc(20000 * SCALE)),
  payments: Math.max(500, Math.trunc(18000 * SCALE)),
  waste: Math.max(500, Math.trunc(16000 * SCALE)),
};

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
});

async function pickLocationId() {
  const found = await client.query('SELECT id FROM locations WHERE is_active = true ORDER BY id ASC LIMIT 1');
  if (found.rows.length > 0) return Number(found.rows[0].id);
  const created = await client.query(
    `INSERT INTO locations (name, address, phone, is_active)
     VALUES ('Load Test Branch', 'Synthetic branch', '+000000000', true)
     RETURNING id`
  );
  return Number(created.rows[0].id);
}

async function ensureActors(locationId) {
  const admin = await client.query(
    `INSERT INTO users (username, email, password_hash, role, location_id, is_active)
     VALUES ('load_admin', 'load_admin@example.com', '$2a$10$k5H8f3wLQ6R4M7n3YJ8YWeQGJdu4GkYtWJiv6M1rJfX9O4aYg8zXe', 'admin', $1, true)
     ON CONFLICT (username) DO UPDATE SET location_id = EXCLUDED.location_id
     RETURNING id`,
    [locationId]
  );
  const cashier = await client.query(
    `INSERT INTO users (username, email, password_hash, role, location_id, is_active)
     VALUES ('load_cashier', 'load_cashier@example.com', '$2a$10$k5H8f3wLQ6R4M7n3YJ8YWeQGJdu4GkYtWJiv6M1rJfX9O4aYg8zXe', 'cashier', $1, true)
     ON CONFLICT (username) DO UPDATE SET location_id = EXCLUDED.location_id
     RETURNING id`,
    [locationId]
  );
  return { adminId: Number(admin.rows[0].id), cashierId: Number(cashier.rows[0].id) };
}

async function ensureLoadCategories(adminId) {
  await client.query(
    `INSERT INTO categories (name, created_by)
     SELECT 'Load Category ' || gs, $1
     FROM generate_series(1, 30) gs
     WHERE NOT EXISTS (
       SELECT 1 FROM categories existing WHERE existing.name = ('Load Category ' || gs)
     )`,
    [adminId]
  );
}

async function run() {
  await client.connect();
  const locationId = await pickLocationId();
  const { adminId, cashierId } = await ensureActors(locationId);
  await ensureLoadCategories(adminId);

  console.log('Seeding heavy synthetic dataset...');
  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO products (name, group_name, category_id, price, cost, unit, source, is_active, created_by)
       SELECT
         'LOAD_PRODUCT_' || gs,
         'LOAD_GROUP_' || ((gs - 1) % 150 + 1),
         c.id,
         (10 + (gs % 200))::numeric(12,2),
         (4 + (gs % 120))::numeric(12,2),
         'unit',
         CASE WHEN gs % 2 = 0 THEN 'baked' ELSE 'purchased' END,
         true,
         $2
       FROM generate_series(1, $1) gs
       JOIN categories c ON c.name = ('Load Category ' || ((gs - 1) % 30 + 1))`,
      [COUNTS.products, adminId]
    );

    await client.query(
      `INSERT INTO inventory (product_id, location_id, quantity, source, updated_by)
       SELECT p.id, $1, (random() * 400 + 30)::int, p.source, $2
       FROM products p
       WHERE p.name LIKE 'LOAD_PRODUCT_%'
       LIMIT $3`,
      [locationId, adminId, COUNTS.inventoryRows]
    );

    await client.query(
      `INSERT INTO sales (location_id, cashier_id, total_amount, payment_method, sale_date, status, created_at)
       SELECT
         $1,
         $2,
         (random() * 1200 + 25)::numeric(12,2),
         (ARRAY['cash','mobile','telebirr'])[(gs % 3) + 1],
         NOW() - (gs || ' minutes')::interval,
         'completed',
         NOW() - (gs || ' minutes')::interval
       FROM generate_series(1, $3) gs`,
      [locationId, cashierId, COUNTS.sales]
    );

    await client.query(
      `INSERT INTO customer_orders (location_id, cashier_id, customer_name, customer_phone, order_details, total_amount, paid_amount, payment_method, status, prep_status, prep_progress, pickup_at, created_at)
       SELECT
         $1,
         $2,
         'Load Customer ' || gs,
         '+2519' || lpad(((10000000 + gs) % 100000000)::text, 8, '0'),
         'Load order ' || gs,
         (random() * 900 + 40)::numeric(12,2),
         (random() * 600 + 20)::numeric(12,2),
         (ARRAY['cash','mobile','telebirr'])[(gs % 3) + 1],
         (ARRAY['pending','in_production','ready','picked_up'])[(gs % 4) + 1],
         (ARRAY['not_started','preparing','ready'])[(gs % 3) + 1],
         ((gs % 10) * 10),
         NOW() + ((gs % 180) || ' minutes')::interval,
         NOW() - (gs || ' minutes')::interval
       FROM generate_series(1, $3) gs`,
      [locationId, cashierId, COUNTS.orders]
    );

    await client.query(
      `INSERT INTO expenses (location_id, category, description, amount, expense_date, created_by, created_at)
       SELECT
         $1,
         'Operations',
         'Load expense ' || gs,
         (random() * 3000 + 10)::numeric(12,2),
         CURRENT_DATE - ((gs % 120) || ' days')::interval,
         $2,
         NOW() - (gs || ' minutes')::interval
       FROM generate_series(1, $3) gs`,
      [locationId, adminId, COUNTS.expenses]
    );

    await client.query(
      `INSERT INTO staff_payments (location_id, user_id, amount, payment_type, notes, payment_date, created_by, created_at)
       SELECT
         $1,
         $2,
         (random() * 9000 + 300)::numeric(12,2),
         (ARRAY['salary','advance'])[(gs % 2) + 1],
         'Load staff payment ' || gs,
         CURRENT_DATE - ((gs % 180) || ' days')::interval,
         $3,
         NOW() - (gs || ' minutes')::interval
       FROM generate_series(1, $4) gs`,
      [locationId, cashierId, adminId, COUNTS.payments]
    );

    await client.query(
      `INSERT INTO waste_records (location_id, product_id, quantity_wasted, unit_cost, total_loss, reason, wasted_at, created_by)
       SELECT
         $1,
         p.id,
         (random() * 8 + 1)::int,
         p.cost,
         ((random() * 8 + 1)::int * p.cost)::numeric(12,2),
         'expired',
         NOW() - (gs || ' minutes')::interval,
         $2
       FROM generate_series(1, $3) gs
       JOIN LATERAL (
         SELECT id, cost FROM products WHERE name LIKE 'LOAD_PRODUCT_%' ORDER BY random() LIMIT 1
       ) p ON true`,
      [locationId, adminId, COUNTS.waste]
    );

    await client.query('COMMIT');
    console.log('Load test seed complete.', COUNTS);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Load seed failed:', error.message);
  process.exit(1);
});
