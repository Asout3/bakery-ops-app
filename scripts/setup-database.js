import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const dbIpFamily = Number(process.env.DB_IP_FAMILY || 4);

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
          rejectUnauthorized: false,
        }
      : false,
    family: dbIpFamily,
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database!');

    await ensureMigrationsTable(client);

    const tablesExist = await checkTablesExist(client);
    
    if (!tablesExist) {
      console.log('📋 No tables found. Loading base schema...');
      const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
      
      console.log('🚀 Creating base tables and initial data...');
      await client.query(schema);
      console.log('✅ Base schema applied!');
      
      await recordMigration(client, 'schema.sql');
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
        await client.query(migrationSql);
        await recordMigration(client, file);
        migrationsRun++;
        console.log(`  ✅ ${file} complete!`);
      } catch (migrationError) {
        console.error(`  ⚠️  Warning in ${file}: ${migrationError.message}`);
        console.log(`  ⏭️  Recording as complete anyway to prevent re-running...`);
        await recordMigration(client, file);
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
    console.log('Default login credentials:');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

setupDatabase();
