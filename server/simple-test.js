import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function testConnection() {
  console.log('Testing database connection...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('Connected successfully!');
    const res = await client.query('SELECT NOW()');
    console.log('Current time:', res.rows[0].now);
    await client.end();
  } catch (err) {
    console.error('Connection failed:', err.message);
    console.error('Error code:', err.code);
    if (err.code === 'ECONNREFUSED') {
      console.error('Connection refused - database not accepting connections');
    } else if (err.code === 'ENOTFOUND') {
      console.error('Host not found');
    } else if (err.code === '28000') {
      console.error('Authentication failed');
    }
    console.error('Full error:', err);
  }
}

testConnection();