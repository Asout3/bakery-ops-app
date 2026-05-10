import { query } from './db-debug.js';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log('=== DATABASE CONNECTION TEST ===');
  console.log('Environment variables loaded:');
  console.log('- DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
  
  try {
    console.log('\nTesting database connection...');
    const result = await query('SELECT version(), current_database(), current_user');
    console.log('SUCCESS! Database connection working.');
    console.log('PostgreSQL version:', result.rows[0].version);
    console.log('Database name:', result.rows[0].current_database);
    console.log('User:', result.rows[0].current_user);
    
    // Test users table
    console.log('\nTesting users table access...');
    const usersResult = await query('SELECT COUNT(*) as count FROM users');
    console.log('Users table exists, row count:', usersResult.rows[0].count);
    
  } catch (err) {
    console.error('\n=== DATABASE CONNECTION FAILED ===');
    console.error('Error type:', err.constructor.name);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    
    if (err.code === 'ECONNREFUSED') {
      console.error('Connection refused - database server not reachable');
    } else if (err.code === 'ENOTFOUND') {
      console.error('Host not found - check DATABASE_URL');
    } else if (err.code === '28000') {
      console.error('Authentication failed - check credentials');
    } else if (err.code === '3D000') {
      console.error('Database not found - check database name');
    }
    
    console.error('Full error:', err);
    console.error('=====================================');
  }
  
  process.exit(0);
}

testConnection();