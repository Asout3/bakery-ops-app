import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkAdminUser() {
  try {
    await client.connect();
    console.log('Connected to database');
    
    // Check if users table exists and has records
    const usersResult = await client.query('SELECT COUNT(*) as count FROM users');
    console.log('Total users in database:', usersResult.rows[0].count);
    
    // Check if admin user exists
    const adminResult = await client.query('SELECT id, username, email, role FROM users WHERE username = $1', ['admin']);
    console.log('Admin user found:', adminResult.rows.length > 0);
    if (adminResult.rows.length > 0) {
      console.log('Admin user details:', adminResult.rows[0]);
    }
    
    // Show all usernames
    const allUsers = await client.query('SELECT id, username, role FROM users');
    console.log('All users in database:');
    allUsers.rows.forEach(user => {
      console.log(`  - ID: ${user.id}, Username: ${user.username}, Role: ${user.role}`);
    });
    
    await client.end();
  } catch (err) {
    console.error('Error checking admin user:', err.message);
    await client.end().catch(() => {});
  }
}

checkAdminUser();