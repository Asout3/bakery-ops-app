import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function detailedErrorAnalysis() {
  console.log('=== DETAILED ERROR ANALYSIS ===');
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  
  // Try to parse the connection string
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log('\nParsed connection details:');
    console.log('- Host:', url.hostname);
    console.log('- Port:', url.port || 5432);
    console.log('- Database:', url.pathname.substring(1));
    console.log('- Username:', url.username);
    console.log('- Password length:', url.password.length);
    console.log('- Search params:', url.search);
  } catch (err) {
    console.error('Failed to parse DATABASE_URL:', err.message);
    return;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('\nAttempting connection...');
  
  try {
    await client.connect();
    console.log('✓ Connection successful!');
    const result = await client.query('SELECT version(), current_database()');
    console.log('PostgreSQL version:', result.rows[0].version);
    console.log('Database name:', result.rows[0].current_database);
    await client.end();
  } catch (err) {
    console.log('✗ Connection failed!');
    console.log('Error type:', err.constructor.name);
    console.log('Error message:', err.message);
    console.log('Error code:', err.code);
    
    // Detailed error analysis
    if (err.code === 'ECONNREFUSED') {
      console.log('\nECONNREFUSED: Connection refused');
      console.log('- The database server is not accepting connections');
      console.log('- Could be: server down, firewall blocking, wrong host/port');
    } else if (err.code === 'ENOTFOUND') {
      console.log('\nENOTFOUND: Host not found');
      console.log('- DNS resolution failed');
      console.log('- Could be: wrong hostname, network issues');
    } else if (err.code === '28000') {
      console.log('\n28000: Invalid authorization specification');
      console.log('- Authentication failed');
      console.log('- Could be: wrong username/password, user doesn\'t exist');
    } else if (err.code === '3D000') {
      console.log('\n3D000: Invalid catalog name');
      console.log('- Database doesn\'t exist');
      console.log('- Could be: wrong database name');
    } else if (err.code === 'EHOSTUNREACH') {
      console.log('\nEHOSTUNREACH: No route to host');
      console.log('- Network connectivity issue');
    }
    
    console.log('\nFull error object:');
    console.log('- name:', err.name);
    console.log('- message:', err.message);
    console.log('- code:', err.code);
    console.log('- errno:', err.errno);
    console.log('- syscall:', err.syscall);
    console.log('- address:', err.address);
    console.log('- port:', err.port);
    
    if (err.stack) {
      console.log('- stack:', err.stack.split('\n')[0]);
    }
    
    await client.end().catch(() => {});
  }
}

detailedErrorAnalysis();