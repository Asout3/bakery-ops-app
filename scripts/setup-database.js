import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const dbIpFamily = Number(process.env.DB_IP_FAMILY || 4);

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

    console.log('📋 Loading schema...');
    const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
    
    console.log('🚀 Creating tables and initial data...');
    await client.query(schema);
    
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
