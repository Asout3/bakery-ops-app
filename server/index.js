import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import helmet from 'helmet';
import pool, { ensureActivityLogRetentionSchema, ensureAuthSecuritySchema, ensureIdempotencySchema, ensureNotificationsSchema, ensureOrdersSchema, ensureProductCreatorSchema, isTransientDbError } from './db.js';
import { ensureReceiptSchema } from './services/receiptService.js';
import { ensureWasteSchema } from './services/wasteService.js';
import { apiLimiter, validateEnvironment, getCorsOptions } from './middleware/security.js';
import { attachRequestContext } from './middleware/requestContext.js';
import { errorHandler } from './utils/errors.js';
import { isProductionRuntime } from './utils/runtime.js';

import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import inventoryRoutes, { warmInventoryRouteCaches } from './routes/inventory.js';
import salesRoutes from './routes/sales.js';
import expensesRoutes from './routes/expenses.js';
import paymentsRoutes from './routes/payments.js';
import reportsRoutes from './routes/reports.js';
import notificationsRoutes from './routes/notifications.js';
import activityRoutes from './routes/activity.js';
import locationsRoutes from './routes/locations.js';
import adminRoutes from './routes/admin.js';
import syncRoutes from './routes/sync.js';
import archiveRoutes from './routes/archive.js';
import ordersRoutes from './routes/orders.js';
import wasteRoutes from './routes/waste.js';
import { startArchiveScheduler } from './services/archiveService.js';

dotenv.config();

validateEnvironment();
await ensureAuthSecuritySchema();
await ensureIdempotencySchema();
await ensureProductCreatorSchema();
await ensureOrdersSchema();
await ensureNotificationsSchema();
await ensureActivityLogRetentionSchema();
await ensureWasteSchema();
await ensureReceiptSchema();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = isProductionRuntime;

app.set('trust proxy', isProduction ? 1 : 0);
app.use(attachRequestContext);

app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: isProduction,
  crossOriginOpenerPolicy: isProduction,
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: isProduction ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
}));

app.use(cors(getCorsOptions()));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(isProduction ? 'combined' : 'dev'));
}

app.options('/api/health', (req, res) => {
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

app.get('/api/health', async (req, res) => {
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false, reason: 'Database not ready' });
  }
});

app.options('/api/live', (req, res) => {
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.sendStatus(204);
});

app.get('/api/live', (req, res) => {
  res.header('Cache-Control', 'no-store');
  res.status(200).json({ alive: true, timestamp: Date.now() });
});

app.use('/api/', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/waste', wasteRoutes);

app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    path: req.path,
    requestId: req.requestId || req.headers['x-request-id'] || `req-${Date.now()}`
  });
});

const server = app.listen(PORT, () => {
  console.log(`[INFO] Server running on port ${PORT}`);
  console.log(`[INFO] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[INFO] Process ID: ${process.pid}`);
});

const shouldRunSchedulersInApi = process.env.RUN_SCHEDULERS_IN_API !== 'false';

if (shouldRunSchedulersInApi) {
  startArchiveScheduler();
} else {
  console.log('[INFO] API scheduler loops disabled (RUN_SCHEDULERS_IN_API=false)');
}

warmInventoryRouteCaches().catch((err) => {
  console.error('[WARN] Failed to warm inventory route caches:', err.message);
});

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`[INFO] Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async () => {
    console.log('[INFO] HTTP server closed');
    
    try {
      await pool.end();
      console.log('[INFO] Database pool closed');
    } catch (err) {
      console.error('[ERROR] Failed to close database pool:', err.message);
    }
    
    console.log('[INFO] Graceful shutdown complete');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('[ERROR] Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  if (isTransientDbError(err)) {
    console.error('[WARN] Ignoring transient DB exception to keep API process alive');
    return;
  }
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  if (isTransientDbError(reason)) {
    console.error('[WARN] Ignoring transient DB rejection to keep API process alive');
    return;
  }
  gracefulShutdown('unhandledRejection');
});

export default app;
