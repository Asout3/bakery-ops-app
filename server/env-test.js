// Test environment loading and connection in sequence
import dotenv from 'dotenv';
import pg from 'pg';

// Load environment first
const envResult = dotenv.config();
console.log('Environment loading result:', envResult.error ? 'FAILED' : 'SUCCESS');

if (envResult.error) {
  console.error('Environment loading failed:', envResult.error.message);
  process.exit(1);
}

console.log('\nEnvironment variables:');
console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL length:', process.env.DATABASE_URL?.length || 0);
if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL preview:', process.env.DATABASE_URL.substring(0, 50) + '...');
}

console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('PORT:', process.env.PORT || 'not set');

// Now test the connection
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('\nAttempting database connection...');

client.connect()
  .then(() => {
    console.log('✓ Database connection successful!');
    return client.query('SELECT version(), current_database(), current_user');
  })
  .then(dbResult => {
    console.log('Database info:');
    console.log('- Version:', dbResult.rows[0].version);
    console.log('- Database:', dbResult.rows[0].current_database);
    console.log('- User:', dbResult.rows[0].current_user);
    return client.end();
  })
  .then(() => {
    console.log('✓ Connection closed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('✗ Database connection failed!');
    console.error('Error:', err.message);
    console.error('Code:', err.code);
    client.end().catch(() => {});
    process.exit(1);
  });