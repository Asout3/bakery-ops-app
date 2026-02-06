import dotenv from 'dotenv';

dotenv.config();

console.log('Environment variables:');
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);

// Parse the DATABASE_URL to see components
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log('\nParsed DATABASE_URL:');
    console.log('Protocol:', url.protocol);
    console.log('Host:', url.hostname);
    console.log('Port:', url.port || 'default');
    console.log('Username:', url.username);
    console.log('Password:', url.password ? '***' : 'none');
    console.log('Database:', url.pathname.substring(1));
    console.log('Search params:', url.search);
  } catch (err) {
    console.error('Error parsing DATABASE_URL:', err.message);
  }
}