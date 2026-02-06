import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

console.log('=== Database Connection Debug ===');
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Test different connection approaches
console.log('\n--- Testing Database Connection ---');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Pool error:', err);
});

// Test connection
async function testConnection() {
  let client;
  try {
    console.log('Attempting to connect to database...');
    client = await pool.connect();
    console.log('✅ Successfully connected to database!');
    
    // Test a simple query
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✅ Query test successful:', result.rows[0]);
    
    // Check if users table exists
    try {
      const tableCheck = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      `);
      console.log('Users table exists:', tableCheck.rows.length > 0);
      
      if (tableCheck.rows.length > 0) {
        const userCount = await client.query('SELECT COUNT(*) as count FROM users');
        console.log('Number of users:', userCount.rows[0].count);
      }
    } catch (tableErr) {
      console.log('Table check error:', tableErr.message);
    }
    
  } catch (err) {
    console.error('❌ Database connection failed:');
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
    // Try alternative connection methods
    console.log('\n--- Trying alternative connection methods ---');
    
    // Try without SSL
    console.log('Trying without SSL...');
    const poolNoSSL = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false
    });
    
    try {
      const clientNoSSL = await poolNoSSL.connect();
      console.log('✅ Connected without SSL!');
      await clientNoSSL.release();
    } catch (noSSLErr) {
      console.error('❌ No SSL connection also failed:', noSSLErr.message);
    }
    
  } finally {
    if (client) {
      await client.release();
    }
    await pool.end();
  }
}

testConnection();