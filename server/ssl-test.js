import pg from 'pg';

const { Client } = pg;

async function testSSLConfigs() {
  const baseConfig = {
    host: 'ep-gentle-cloud-ai059op6-pooler.c-4.us-east-1.aws.neon.tech',
    database: 'neondb',
    user: 'neondb_owner',
    password: 'npg_hZt3oVFsM5cR',
    port: 5432
  };

  const sslConfigs = [
    { name: 'No SSL', config: { ...baseConfig, ssl: false } },
    { name: 'SSL require', config: { ...baseConfig, ssl: { require: true, rejectUnauthorized: false } } },
    { name: 'SSL prefer', config: { ...baseConfig, ssl: { require: false, rejectUnauthorized: false } } },
    { name: 'SSL verify-ca', config: { ...baseConfig, ssl: { require: true, rejectUnauthorized: true } } }
  ];

  console.log('=== TESTING DIFFERENT SSL CONFIGURATIONS ===\n');

  for (const { name, config } of sslConfigs) {
    console.log(`Testing: ${name}`);
    const client = new Client(config);
    
    try {
      await client.connect();
      console.log(`✓ ${name}: SUCCESS`);
      const result = await client.query('SELECT 1 as test');
      console.log(`  Result: ${result.rows[0].test}`);
      await client.end();
    } catch (err) {
      console.log(`✗ ${name}: FAILED - ${err.message}`);
      await client.end().catch(() => {});
    }
    console.log('');
  }
}

testSSLConfigs();