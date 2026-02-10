import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? {
        rejectUnauthorized: false,
      }
    : false,
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
