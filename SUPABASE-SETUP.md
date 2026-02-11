# Supabase Setup Guide for Bakery Operations App

## TL;DR (what you do vs what to run locally)

### What you do in Supabase web UI
1. Create a project.
2. Go to **Project Settings → Database** and copy the connection string.
3. Make sure the DB password in that string is correct.
4. (If SQL Editor is easier for you) you can run schema/migrations there instead of terminal `psql`.

### What to run in this repository
1. Put that string in `.env` as `DATABASE_URL=...` and add `DB_IP_FAMILY=4` (helps in IPv4-only dev environments like some Codespaces).
2. Run:
   ```bash
   npm run setup-db
   psql "$DATABASE_URL" -f database/migrations/001_ops_hardening.sql
   psql "$DATABASE_URL" -f database/migrations/002_branch_access_and_kpi.sql
   npm run dev
   ```
3. Login with default seed user:
   - username: `admin`
   - password: `admin123`

## Why Supabase?
- ✅ FREE PostgreSQL database (500MB storage)
- ✅ Works PERFECTLY with GitHub Codespaces (no port blocking!)
- ✅ No credit card required
- ✅ Direct database access + SQL Editor in browser
- ✅ Auto backups
- ✅ Connection pooling built-in

## Step-by-Step Setup (10 Minutes Total)

### Step 1: Create Supabase Account (2 minutes)

1. **Go to Supabase**
   - Visit: https://supabase.com
   - Click **"Start your project"**
   - Sign up with **GitHub** (easiest and fastest!)
   - No credit card needed!

### Step 2: Create New Project (2 minutes)

1. After signing in, click **"New Project"**
2. Fill in:
   - **Organization**: (Auto-created with your name)
   - **Name**: `bakery-ops`
   - **Database Password**: Create a strong password
     - **WRITE THIS DOWN!** You'll need it!
     - Example: `BakeryOps2024!Secure`
   - **Region**: Choose closest to you (e.g., East US)
   - **Pricing Plan**: **Free** (already selected)

3. Click **"Create new project"**
4. Wait 2-3 minutes while it sets up (grab a coffee ☕)

### Step 3: Get Connection String (1 minute)

1. Once project is ready, click **"Connect"** button (top right)
2. In the modal, select **"App Frameworks"**
3. Look for the connection string that starts with:
   ```
   postgresql://postgres.xxx:[YOUR-PASSWORD]@xxx.supabase.co:5432/postgres
   ```
4. **Copy this connection string**
5. Replace `[YOUR-PASSWORD]` with the password you created in Step 2

Your final connection string should look like:
```
postgresql://postgres.xxx:BakeryOps2024!Secure@xxx.supabase.co:5432/postgres
```

### Step 4: Load Database Schema (1 minute)

**Option A: Using SQL Editor (Recommended - Easy!)**

1. In Supabase dashboard, click **"SQL Editor"** (left sidebar)
2. Click **"New Query"**
3. Copy the ENTIRE contents of `/workspaces/bakery-ops-app/database/schema.sql`
4. Paste into the SQL editor
5. Click **"Run"** (or Ctrl+Enter)
6. You should see "Success. No rows returned"

**Option B: Using Terminal (recommended for repeatability)**

In your Codespace:
```bash
cd /workspaces/bakery-ops-app

# Set your Supabase connection string (replace with yours)
DATABASE_URL="postgresql://postgres.xxx:BakeryOps2024!Secure@xxx.supabase.co:5432/postgres" npm run setup-db

# Apply post-schema migrations used by this project
psql "$DATABASE_URL" -f database/migrations/001_ops_hardening.sql
psql "$DATABASE_URL" -f database/migrations/002_branch_access_and_kpi.sql
```

You should see:
```
✅ Database setup complete!
Default login credentials:
  Username: admin
  Password: admin123
```

### Step 5: Update Backend .env (1 minute)

In your Codespace terminal:

```bash
cd /workspaces/bakery-ops-app

# Create/update .env file
cat > .env << 'EOF'
PORT=5000
DATABASE_URL=YOUR_SUPABASE_CONNECTION_STRING_HERE
DB_IP_FAMILY=4
JWT_SECRET=super_secret_jwt_key_for_bakery_ops_2024_change_in_production
NODE_ENV=development
EOF
```

**IMPORTANT**: Replace `YOUR_SUPABASE_CONNECTION_STRING_HERE` with your actual Supabase connection string!

### Step 6: Restart Backend (1 minute)

```bash
cd /workspaces/bakery-ops-app

# Stop servers (Ctrl+C if running)

# Start fresh
npm run dev
```

### Step 7: Test Login! 🎉

1. Go to your frontend (port 3000 or 3001)
2. Try logging in:
   - **Username**: `admin`
   - **Password**: `admin123`

**IT SHOULD WORK NOW!** 🎉

---

## Verify Everything is Working

### Check Database Tables in Supabase:

1. In Supabase dashboard, click **"Table Editor"** (left sidebar)
2. You should see all your tables:
   - users
   - products
   - inventory
   - sales
   - expenses
   - etc.

3. Click on **"users"** table
4. You should see 1 row with username `admin`

### Check Backend Connection:

In your Codespace terminal:
```bash
curl http://localhost:5000/api/health
```

Should return:
```json
{"status":"ok","timestamp":"2024-..."}
```

---

## Troubleshooting

### "Connection timeout" error?
- Double-check your connection string
- Make sure you replaced `[YOUR-PASSWORD]` with your actual password
- Try adding `?sslmode=require` to the end of the connection string

### "Password authentication failed"?
- You might have copied the wrong password
- Go to Supabase → Settings → Database → Reset database password

### Backend still won't connect?
- Make sure .env file exists in `/workspaces/bakery-ops-app/`
- Check: `cat /workspaces/bakery-ops-app/.env`
- Restart the backend completely

### Tables not created?
- Run the SQL manually in Supabase SQL Editor
- Copy entire content of database/schema.sql and run it

---

## Supabase Free Tier Limits

✅ **500 MB database storage** (more than enough for this app)  
✅ **Unlimited API requests**  
✅ **500 MB bandwidth per month**  
✅ **2 GB file storage**  
✅ **50,000 monthly active users**  
✅ **Social OAuth providers**  
✅ **Auto backups (7 days retention)**  
✅ **Community support**

**Perfect for development and small production apps!**

---

## Quick Checklist

- [ ] Sign up for Supabase with GitHub
- [ ] Create new project "bakery-ops"
- [ ] Set and save database password
- [ ] Get connection string from "Connect" button
- [ ] Replace [YOUR-PASSWORD] with actual password
- [ ] Load schema using SQL Editor OR terminal
- [ ] Update /workspaces/bakery-ops-app/.env with Supabase URL
- [ ] Restart backend with `npm run dev`
- [ ] Check http://localhost:5000/api/health
- [ ] Test login with admin/admin123
- [ ] Verify tables in Supabase Table Editor

---

## Why Supabase is Better for Codespaces

1. ✅ **No port 5432 blocking** - Uses standard PostgreSQL with connection pooling
2. ✅ **Built-in UI** - Easy to see your data in browser
3. ✅ **SQL Editor** - Run queries directly in browser
4. ✅ **Row-level security** - Better security features
5. ✅ **Real-time subscriptions** - Can add live updates later
6. ✅ **Storage included** - Can add file uploads easily

---

Let me know when you've created your Supabase project and I'll help you get the connection string set up correctly! 🚀
