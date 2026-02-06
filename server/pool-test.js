import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, Client } = pg;

async function testPoolVsClient() {
  const connectionString = process.env.DATABASE_URL;
  
  console.log('=== TESTING POOL VS DIRECT CLIENT ===');
  console.log('Connection string:', connectionString.substring(0, 60) + '...');

  // Test 1: Direct client connection
  console.log('\n1. Testing direct client connection:');
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✓ Direct client connection: SUCCESS');
    const result = await client.query('SELECT NOW() as time');
    console.log('  Time:', result.rows[0].time);
    await client.end();
  } catch (err) {
    console.log('✗ Direct client connection: FAILED -', err.message);
    await client.end().catch(() => {});
  }

  // Test 2: Pool connection
  console.log('\n2. Testing pool connection:');
  const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const poolClient = await pool.connect();
    console.log('✓ Pool connection: SUCCESS');
    const result = await poolClient.query('SELECT NOW() as time');
    console.log('  Time:', result.rows[0].time);
    poolClient.release();
    await pool.end();
  } catch (err) {
    console.log('✗ Pool connection: FAILED -', err.message);
    await pool.end().catch(() => {});
  }

  // Test 3: Pool query method
  console.log('\n3. Testing pool query method:');
  const pool2 = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const result = await pool2.query('SELECT NOW() as time');
    console.log('✓ Pool query method: SUCCESS');
    console.log('  Time:', result.rows[0].time);
    await pool2.end();
  } catch (err) {
    console.log('✗ Pool query method: FAILED -', err.message);
    await pool2.end().catch(() => {});
  }
}

testPoolVsClient();