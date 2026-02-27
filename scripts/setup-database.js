import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const dbIpFamily = Number(process.env.DB_IP_FAMILY || 4);

const isProduction = process.env.NODE_ENV === 'production';
const shouldRejectUnauthorized = process.env.SSL_REJECT_UNAUTHORIZED !== 'false';

async function ensureDefaultAdminSeed(client) {
  const allowDevSeed = process.env.ALLOW_DEV_SEED !== 'false';
  if (isProduction || !allowDevSeed) {
    return;
  }

  await client.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ('admin', 'admin@bakery.com', $1, 'admin')
     ON CONFLICT (username) DO NOTHING`,
    ['$2a$10$dn8KZ/YdUSxWjAWlAnK2We/oAbn6LIhLGDsQYurAhjDWkzpLYvmL2']
  );
}

async function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, '../database/migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  return files;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function hasMigrationRun(client, filename) {
  const result = await client.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [filename]
  );
  return result.rows.length > 0;
}

async function recordMigration(client, filename) {
  await client.query(
    'INSERT INTO schema_migrations (filename) VALUES ($1)',
    [filename]
  );
}


async function acquireSetupLock(client) {
  await client.query('SELECT pg_advisory_lock($1)', [90421001]);
}

async function releaseSetupLock(client) {
  await client.query('SELECT pg_advisory_unlock($1)', [90421001]);
}

async function checkTablesExist(client) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name = 'users'
    ) as exists
  `);
  return result.rows[0].exists;
}

async function setupDatabase() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL
      ? {
          rejectUnauthorized: shouldRejectUnauthorized,
          ...(shouldRejectUnauthorized && process.env.SSL_CA_CERT ? { ca: process.env.SSL_CA_CERT } : {}),
        }
      : false,
    family: dbIpFamily,
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database!');

    await acquireSetupLock(client);
    await ensureMigrationsTable(client);

    const tablesExist = await checkTablesExist(client);
    
    if (!tablesExist) {
      console.log('📋 No tables found. Loading base schema...');
      const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
      
      console.log('🚀 Creating base tables and initial data...');
      await client.query('BEGIN');
      await client.query(schema);
      await recordMigration(client, 'schema.sql');
      await ensureDefaultAdminSeed(client);
      await client.query('COMMIT');
      console.log('✅ Base schema applied!');
    } else {
      console.log('📋 Database tables already exist. Checking for new migrations...');
    }
    
    console.log('📦 Running migrations...');
    const migrationFiles = await getMigrationFiles();
    console.log(`Found ${migrationFiles.length} migration files...`);
    
    let migrationsRun = 0;
    for (const file of migrationFiles) {
      if (await hasMigrationRun(client, file)) {
        console.log(`  ⏭️  Skipping ${file} (already run)`);
        continue;
      }
      
      console.log(`  🔄 Running ${file}...`);
      const migrationSql = fs.readFileSync(
        path.join(__dirname, '../database/migrations', file),
        'utf8'
      );
      
      try {
        await client.query('BEGIN');
        await client.query(migrationSql);
        await recordMigration(client, file);
        await client.query('COMMIT');
        migrationsRun++;
        console.log(`  ✅ ${file} complete!`);
      } catch (migrationError) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Migration failed in ${file}: ${migrationError.message}`);
        throw migrationError;
      }
    }
    
    if (migrationsRun === 0) {
      console.log('✅ All migrations already up to date!');
    } else {
      console.log(`✅ Applied ${migrationsRun} new migration(s)!`);
    }
    
    console.log('');
    console.log('✅ Database setup complete!');
    console.log('');
    if (!isProduction && process.env.ALLOW_DEV_SEED !== 'false') {
      console.log('Default login credentials:');
      console.log('  Username: admin');
      console.log('  Password: admin123');
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  } finally {
    try {
      await releaseSetupLock(client);
    } catch (lockErr) {
      console.error('⚠️ Failed to release setup lock:', lockErr.message);
    }
    await client.end();
  }
}

setupDatabase();
