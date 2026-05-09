import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
});

async function run() {
  await client.connect();
  await client.query('BEGIN');
  try {
    await client.query('TRUNCATE TABLE activity_log, notifications, waste_records, order_items, customer_orders, sale_items, sales, staff_payments, expenses, inventory, stock_batches RESTART IDENTITY CASCADE');
    await client.query("DELETE FROM products WHERE name LIKE 'LOAD_PRODUCT_%'");
    await client.query("DELETE FROM users WHERE username IN ('load_admin', 'load_cashier')");
    await client.query("DELETE FROM locations WHERE name = 'Load Test Branch'");
    await client.query('COMMIT');
    console.log('Load test data reset complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Load reset failed:', error.message);
  process.exit(1);
});
