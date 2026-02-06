import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

console.log('=== DATABASE POOL CONFIGURATION ===');
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SSL config:', process.env.NODE_ENV === 'production' ? 'enabled' : 'disabled');

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

console.log('Pool config:', {
  connectionString: poolConfig.connectionString ? 'SET' : 'NOT SET',
  ssl: poolConfig.ssl
});

const pool = new Pool(poolConfig);

// Enhanced error handling
pool.on('error', (err) => {
  console.error('=== UNEXPECTED DATABASE POOL ERROR ===');
  console.error('Error:', err.message);
  console.error('Code:', err.code);
  console.error('Stack:', err.stack);
  console.error('=====================================');
  // Don't exit process, just log the error
});

pool.on('connect', (client) => {
  console.log('=== NEW DATABASE CONNECTION ESTABLISHED ===');
});

pool.on('acquire', (client) => {
  console.log('=== DATABASE CONNECTION ACQUIRED ===');
});

pool.on('remove', (client) => {
  console.log('=== DATABASE CONNECTION REMOVED ===');
});

// Debug function to test connection
export async function debugPool() {
  try {
    console.log('Testing database connection...');
    const client = await pool.connect();
    console.log('Connected successfully!');
    const result = await client.query('SELECT NOW() as current_time');
    console.log('Query result:', result.rows[0]);
    client.release();
    return { success: true, time: result.rows[0].current_time };
  } catch (err) {
    console.error('=== DATABASE CONNECTION TEST FAILED ===');
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error stack:', err.stack);
    if (err.code === 'ECONNREFUSED') {
      console.error('CONNECTION REFUSED - Database server not running or unreachable');
    }
    console.error('=========================================');
    return { success: false, error: err.message };
  }
}

// Enhanced query function with debugging
export const query = async (text, params) => {
  const start = Date.now();
  console.log('=== DATABASE QUERY ===');
  console.log('Query text:', text);
  console.log('Query params:', params);
  
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query successful - duration:', duration, 'ms');
    console.log('Rows returned:', res.rowCount);
    return res;
  } catch (err) {
    const duration = Date.now() - start;
    console.error('=== DATABASE QUERY FAILED ===');
    console.error('Query text:', text);
    console.error('Query params:', params);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Duration:', duration, 'ms');
    console.error('Stack:', err.stack);
    console.error('=========================');
    throw err;
  }
};

export default pool;