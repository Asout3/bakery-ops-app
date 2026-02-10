import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

const poolConfig = hasDatabaseUrl
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    }
  : {
      host: process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'bakery_ops',
      ssl: false,
    };

if (!hasDatabaseUrl) {
  console.warn(
    '[db] DATABASE_URL is not set. Using PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE for local development.'
  );
}

const pool = new Pool({
  ...poolConfig,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 4000),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

export const query = (text, params) => pool.query(text, params);

export const withTransaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export default pool;
