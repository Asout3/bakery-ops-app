import pg from 'pg';

// Manual connection configuration
const { Client } = pg;

async function testManualConnection() {
  const config = {
    host: 'ep-gentle-cloud-ai059op6-pooler.c-4.us-east-1.aws.neon.tech',
    database: 'neondb',
    user: 'neondb_owner',
    password: 'npg_hZt3oVFsM5cR',
    port: 5432,
    ssl: {
      rejectUnauthorized: false
    }
  };

  console.log('Testing manual connection with config:', {
    host: config.host,
    database: config.database,
    user: config.user,
    port: config.port,
    ssl: config.ssl ? 'enabled' : 'disabled'
  });

  const client = new Client(config);

  try {
    await client.connect();
    console.log('SUCCESS: Manual connection works!');
    const result = await client.query('SELECT version(), current_database(), current_user');
    console.log('PostgreSQL version:', result.rows[0].version);
    console.log('Current database:', result.rows[0].current_database);
    console.log('Current user:', result.rows[0].current_user);
    await client.end();
    return true;
  } catch (err) {
    console.error('Manual connection failed:', err.message);
    console.error('Error details:', {
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      address: err.address,
      port: err.port
    });
    await client.end().catch(() => {});
    return false;
  }
}

// Test original connection string as well
async function testConnectionString() {
  const connectionString = 'postgresql://neondb_owner:npg_hZt3oVFsM5cR@ep-gentle-cloud-ai059op6-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';
  
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Testing with connection string:', connectionString.substring(0, 80) + '...');
    await client.connect();
    console.log('SUCCESS: Connection string works!');
    const result = await client.query('SELECT version(), current_database()');
    console.log('Result:', result.rows[0]);
    await client.end();
    return true;
  } catch (err) {
    console.error('Connection string failed:', err.message);
    await client.end().catch(() => {});
    return false;
  }
}

async function main() {
  console.log('=== DATABASE CONNECTION TESTS ===\n');
  
  const manualSuccess = await testManualConnection();
  console.log('\n---\n');
  const stringSuccess = await testConnectionString();
  
  console.log('\n=== SUMMARY ===');
  console.log('Manual config:', manualSuccess ? 'SUCCESS' : 'FAILED');
  console.log('Connection string:', stringSuccess ? 'SUCCESS' : 'FAILED');
  
  if (!manualSuccess && !stringSuccess) {
    console.log('\nBoth connection methods failed - likely network or authentication issue');
  } else if (manualSuccess && !stringSuccess) {
    console.log('\nManual config works but connection string fails - URL parsing issue');
  } else if (!manualSuccess && stringSuccess) {
    console.log('\nConnection string works but manual config fails - config issue');
  } else {
    console.log('\nBoth methods work - issue might be in application code');
  }
}

main();