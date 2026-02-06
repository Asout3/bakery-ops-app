// Minimal database connection test
import pg from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_hZt3oVFsM5cR@ep-gentle-cloud-ai059op6-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

console.log('Testing connection to:', connectionString.substring(0, 60) + '...');

const client = new pg.Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    console.log('Connecting...');
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const result = await client.query('SELECT version(), NOW() as current_time');
    console.log('PostgreSQL version:', result.rows[0].version);
    console.log('Current time:', result.rows[0].current_time);
    
    await client.end();
    console.log('✅ Connection closed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection failed!');
    console.error('Error:', err.message);
    console.error('Code:', err.code);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

test();