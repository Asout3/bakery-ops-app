import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const dbIpFamily = Number(process.env.DB_IP_FAMILY || 4);
const isProduction = process.env.NODE_ENV === 'production';

const shouldRejectUnauthorized = process.env.SSL_REJECT_UNAUTHORIZED !== 'false';

const getSSLConfig = () => {
  if (isProduction || hasDatabaseUrl) {
    return {
      ssl: {
        rejectUnauthorized: shouldRejectUnauthorized,
        ...(shouldRejectUnauthorized && process.env.SSL_CA_CERT ? {
          ca: process.env.SSL_CA_CERT
        } : {})
      }
    };
  }
  return { ssl: false };
};

const poolConfig = hasDatabaseUrl
  ? {
      connectionString: process.env.DATABASE_URL,
      ...getSSLConfig(),
      family: dbIpFamily,
    }
  : {
      host: process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'bakery_ops',
      ...getSSLConfig(),
      family: dbIpFamily,
    };

if (!hasDatabaseUrl) {
  console.warn(
    '[WARN] DATABASE_URL is not set. Using PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE for local development.'
  );
}

if (isProduction && !hasDatabaseUrl) {
  console.error('[FATAL] DATABASE_URL is required in production environment');
  process.exit(1);
}

if (!shouldRejectUnauthorized && isProduction) {
  console.warn('[WARN] SSL_REJECT_UNAUTHORIZED is disabled in production. This is insecure!');
}

const MAX_POOL_SIZE = Number(process.env.DB_MAX_POOL_SIZE || (isProduction ? 10 : 20));
const MIN_POOL_SIZE = Number(process.env.DB_MIN_POOL_SIZE || 2);
const CONNECTION_TIMEOUT = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000);
const IDLE_TIMEOUT = Number(process.env.DB_IDLE_TIMEOUT_MS || 30000);
const STATEMENT_TIMEOUT = Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000);
const IDLE_IN_TX_TIMEOUT = Number(process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS || 15000);

const TRANSIENT_DB_ERROR_CODES = new Set([
  '57P01',
  '57P02',
  '57P03',
  '08000',
  '08003',
  '08006',
  '08001',
  '08004',
  '53300',
]);

export function isTransientDbError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (TRANSIENT_DB_ERROR_CODES.has(error?.code)) return true;
  return message.includes('connection terminated')
    || message.includes('connection timeout')
    || message.includes('not queryable')
    || message.includes('econnreset')
    || message.includes('econnrefused')
    || message.includes('terminating connection');
}

function annotateDatabaseError(error) {
  if (isTransientDbError(error)) {
    error.status = 503;
    error.code = error.code || 'DB_UNAVAILABLE';
  }
  return error;
}

const pool = new Pool({
  ...poolConfig,
  max: MAX_POOL_SIZE,
  min: MIN_POOL_SIZE,
  connectionTimeoutMillis: CONNECTION_TIMEOUT,
  idleTimeoutMillis: IDLE_TIMEOUT,
  allowExitOnIdle: false,
  statement_timeout: STATEMENT_TIMEOUT,
  idle_in_transaction_session_timeout: IDLE_IN_TX_TIMEOUT,
  application_name: process.env.DB_APPLICATION_NAME || 'bakery-ops-api',
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB] Client connected');
  }
});

pool.on('remove', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB] Client removed from pool');
  }
});

pool.on('error', (err, client) => {
  console.error('[DB ERROR] Unexpected error on idle client:', err.message);
  if (isProduction) {
    console.error('[DB ERROR] This may indicate a database connectivity issue');
  }
});

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      console.warn(`[DB SLOW QUERY] ${duration}ms: ${text.substring(0, 100)}...`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[DB ERROR] Query failed after ${duration}ms:`, error.message);
    throw annotateDatabaseError(error);
  }
};

export const withTransaction = async (callback) => {
  const start = Date.now();
  let client = null;
  let shouldDestroyClient = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await callback({
      query: (text, params) => client.query(text, params)
    });
    await client.query('COMMIT');

    const duration = Date.now() - start;
    if (duration > 2000) {
      console.warn(`[DB SLOW TRANSACTION] ${duration}ms`);
    }

    return result;
  } catch (error) {
    shouldDestroyClient = isTransientDbError(error);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        shouldDestroyClient = true;
        console.error('[DB TRANSACTION ERROR] Rollback failed:', rollbackError.message);
      }
    }
    const duration = Date.now() - start;
    console.error(`[DB TRANSACTION ERROR] Rolled back after ${duration}ms:`, error.message);
    throw annotateDatabaseError(error);
  } finally {
    if (client) {
      client.release(shouldDestroyClient);
    }
  }
};

export const healthCheck = async () => {
  try {
    const start = Date.now();
    const result = await pool.query('SELECT NOW() as now, version() as version');
    const latency = Date.now() - start;
    
    return {
      healthy: true,
      latencyMs: latency,
      timestamp: result.rows[0].now,
      version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1],
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      }
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      }
    };
  }
};

export const getPoolStats = () => ({
  totalCount: pool.totalCount,
  idleCount: pool.idleCount,
  waitingCount: pool.waitingCount,
  max: MAX_POOL_SIZE,
  min: MIN_POOL_SIZE,
});

let authSecuritySchemaPromise = null;

export async function ensureAuthSecuritySchema() {
  if (authSecuritySchemaPromise) {
    return authSecuritySchemaPromise;
  }

  authSecuritySchemaPromise = (async () => {
    await query(
      `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
       ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ,
       ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`
    );

    await query(
      `CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
         id BIGSERIAL PRIMARY KEY,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         token_hash TEXT NOT NULL UNIQUE,
         expires_at TIMESTAMPTZ NOT NULL,
         revoked_at TIMESTAMPTZ,
         replaced_by_id BIGINT REFERENCES auth_refresh_tokens(id) ON DELETE SET NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );

    await query('CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until)');
    await query('CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_created ON auth_refresh_tokens(user_id, created_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_expires_at ON auth_refresh_tokens(expires_at)');
  })().catch((error) => {
    authSecuritySchemaPromise = null;
    throw error;
  });

  return authSecuritySchemaPromise;
}



export default pool;
