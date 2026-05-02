import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function testRawConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully!');
    
    const result = await client.query('SELECT NOW() as current_time, version()');
    console.log('Current time:', result.rows[0].current_time);
    console.log('Version:', result.rows[0].version);
    
    await client.end();
    console.log('Connection closed successfully');
  } catch (err) {
    console.error('Connection failed:', err.message);
    console.error('Error code:', err.code);
    if (err.stack) {
      console.error('Stack:', err.stack);
    }
    await client.end().catch(() => {});
  }
}

testRawConnection();