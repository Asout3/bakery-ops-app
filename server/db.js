import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('=== DB MODULE LOADED ===');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('========================');

const { Pool } = pg;

// Create pool with explicit configuration
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
};

console.log('Pool config created with:', {
  hasConnectionString: !!process.env.DATABASE_URL,
  sslEnabled: !!process.env.DATABASE_URL
});

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  console.error('This could indicate a connection issue to the database');
});

// Enhanced query function with better error handling
export const query = async (text, params) => {
  console.log(`Executing query: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
  try {
    const result = await pool.query(text, params);
    console.log(`Query successful, rows returned: ${result.rowCount}`);
    return result;
  } catch (err) {
    console.error('Query failed:', err.message);
    console.error('Error code:', err.code);
    throw err;
  }
};

export default pool;
