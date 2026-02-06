# Database Connection Troubleshooting Guide

## Common Issues and Solutions

### 1. ECONNREFUSED Error
**Error**: `connect ECONNREFUSED 127.0.0.1:5432`
**Cause**: Server trying to connect to localhost instead of remote database
**Solutions**:
- Verify DATABASE_URL in .env file points to your Neon database
- Check that .env file is being loaded correctly
- Ensure no local PostgreSQL is interfering

### 2. ENOTFOUND Error
**Error**: `getaddrinfo ENOTFOUND [hostname]`
**Cause**: DNS resolution failed
**Solutions**:
- Check internet connection
- Verify hostname in DATABASE_URL is correct
- Try using IP address instead of hostname

### 3. Authentication Failed
**Error**: `password authentication failed`
**Cause**: Wrong username/password
**Solutions**:
- Get fresh credentials from Neon dashboard
- Verify username and password in connection string
- Check if user has proper permissions

### 4. Database Not Found
**Error**: `database "[name]" does not exist`
**Cause**: Wrong database name
**Solutions**:
- Verify database name in connection string
- Check if database exists in Neon dashboard

## Quick Fix Steps

1. **Verify Neon Database Status**:
   - Go to Neon dashboard
   - Check if database is "Active" (not paused)
   - Get fresh connection string

2. **Update Environment File**:
   ```bash
   # Backup current .env
   cp .env .env.backup
   
   # Update with new connection string
   echo "DATABASE_URL=your_new_connection_string_here" > .env
   ```

3. **Test Connection**:
   ```bash
   npm run debug-db
   # or
   node server/env-test.js
   ```

4. **Start Application**:
   ```bash
   npm run dev
   ```

## Debug Commands

```bash
# Check environment variables
node server/check-env.js

# Test raw connection
node server/simple-test.js

# Comprehensive connection test
node server/comprehensive-test.js

# Error analysis
node server/error-analysis.js
```

## If All Else Fails

1. Create a new Neon database
2. Use the new connection string
3. Migrate your data if needed
4. Update your .env file with new credentials