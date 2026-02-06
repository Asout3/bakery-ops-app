import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

console.log('=== DATABASE CONNECTION DEBUG INFO ===');
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT || 5000);

// Import db module with debugging
import { query, debugPool } from './db-debug.js';

console.log('Database module imported successfully');

// Routes
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import inventoryRoutes from './routes/inventory.js';
import salesRoutes from './routes/sales.js';
import expensesRoutes from './routes/expenses.js';
import paymentsRoutes from './routes/payments.js';
import reportsRoutes from './routes/reports.js';
import notificationsRoutes from './routes/notifications.js';
import activityRoutes from './routes/activity.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Test database connection endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    console.log('Testing database connection...');
    const result = await query('SELECT NOW() as current_time');
    console.log('Database query successful:', result.rows);
    res.json({ 
      status: 'success', 
      message: 'Database connection working',
      time: result.rows[0].current_time
    });
  } catch (err) {
    console.error('Database connection test failed:', err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: err.message 
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activity', activityRoutes);

// Error handling middleware with more detailed logging
app.use((err, req, res, next) => {
  console.error('=== SERVER ERROR ===');
  console.error('Error details:', {
    message: err.message,
    stack: err.stack,
    code: err.code,
    errno: err.errno,
    syscall: err.syscall,
    address: err.address,
    port: err.port
  });
  console.error('Request details:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body
  });
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`=== SERVER STARTED ===`);
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database URL: ${process.env.DATABASE_URL ? 'Configured' : 'NOT CONFIGURED'}`);
  console.log(`=======================`);
  
  // Test database connection on startup
  setTimeout(async () => {
    try {
      console.log('Testing database connection on startup...');
      const result = await query('SELECT version()');
      console.log('Database connection successful!');
      console.log('PostgreSQL version:', result.rows[0].version);
    } catch (err) {
      console.error('=== DATABASE CONNECTION FAILED ON STARTUP ===');
      console.error('Error:', err.message);
      console.error('This is likely the cause of your login issues');
      console.error('==========================================');
    }
  }, 1000);
});

export default app;