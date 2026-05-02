import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbIpFamily = Number(process.env.DB_IP_FAMILY || 4);

const isProduction = process.env.NODE_ENV === 'production';
const shouldRejectUnauthorized = process.env.SSL_REJECT_UNAUTHORIZED !== 'false';

function getDatabaseClientConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    try {
      const parsedUrl = new URL(databaseUrl);
      const fallbackPassword = process.env.PGPASSWORD?.trim();

      // Allow a fallback password when DATABASE_URL omits it.
      const password = parsedUrl.password || fallbackPassword;
      if (!password) {
        throw new Error(
          'DATABASE_URL is set but has no password. Include it in the URL or set PGPASSWORD.'
        );
      }

      return {
        connectionString: databaseUrl,
        ...(parsedUrl.password ? {} : { password }),
      };
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('DATABASE_URL is not a valid URL.');
      }
      throw error;
    }
  }

  const host = process.env.PGHOST || '127.0.0.1';
  const port = Number(process.env.PGPORT || 5432);
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD?.trim();
  const database = process.env.PGDATABASE || 'bakery_ops';

  if (!password) {
    throw new Error(
      'Missing database credentials. Set DATABASE_URL or provide PGPASSWORD with PGHOST/PGPORT/PGUSER/PGDATABASE.'
    );
  }

  return {
    host,
    port,
    user,
    password,
    database,
  };
}

function resolveSeedAdminCredentials() {
  const username = process.env.SEED_ADMIN_USERNAME?.trim() || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD?.trim() || 'Admin@123!';
  const email = process.env.SEED_ADMIN_EMAIL?.trim() || 'admin@bakery.com';
  return { username, password, email };
}

async function ensureDefaultAdminSeed(client) {
  const allowSeed = process.env.ALLOW_DEV_SEED !== 'false';
  if (!allowSeed) {
    return { seeded: false, credentials: null };
  }

  const existingAdmin = await client.query(
    `SELECT id FROM users WHERE role = 'admin' AND is_active = true LIMIT 1`
  );
  if (existingAdmin.rows.length > 0) {
    return { seeded: false, credentials: null };
  }

  const credentials = resolveSeedAdminCredentials();
  const passwordHash = await bcrypt.hash(credentials.password, 10);
  await client.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (username) DO NOTHING`,
    [credentials.username, credentials.email, passwordHash]
  );
  return { seeded: true, credentials };
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
    ...getDatabaseClientConfig(),
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
    let seededAdminInfo = null;

    const tablesExist = await checkTablesExist(client);
    
    if (!tablesExist) {
      console.log('📋 No tables found. Loading base schema...');
      const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
      
      console.log('🚀 Creating base tables and initial data...');
      await client.query('BEGIN');
      await client.query(schema);
      await recordMigration(client, 'schema.sql');
      const seededResult = await ensureDefaultAdminSeed(client);
      seededAdminInfo = seededResult.seeded ? seededResult.credentials : null;
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

    const existingSeedResult = await ensureDefaultAdminSeed(client);
    if (!seededAdminInfo && existingSeedResult.seeded) {
      seededAdminInfo = existingSeedResult.credentials;
    }
    
    console.log('');
    console.log('✅ Database setup complete!');
    console.log('');
    if (seededAdminInfo) {
      console.log('Admin account created:');
      console.log(`  Username: ${seededAdminInfo.username}`);
      console.log(`  Password: ${seededAdminInfo.password}`);
      console.log('');
    } else if (!isProduction && process.env.ALLOW_DEV_SEED !== 'false') {
      const fallbackCredentials = resolveSeedAdminCredentials();
      console.log('Admin account already exists. Default seed credentials:');
      console.log(`  Username: ${fallbackCredentials.username}`);
      console.log(`  Password: ${fallbackCredentials.password}`);
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
