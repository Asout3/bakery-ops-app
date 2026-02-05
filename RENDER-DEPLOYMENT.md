# Render.com Deployment Guide

This guide will help you deploy the Bakery Operations backend to Render.com (FREE tier).

## Why Render.com?
- ✅ Free PostgreSQL database (1GB storage)
- ✅ Free backend hosting
- ✅ No credit card required
- ✅ Auto-deploys from GitHub
- ✅ No network restrictions

## Step-by-Step Deployment

### Part 1: Create Render Account & PostgreSQL Database

1. **Go to Render.com**
   - Visit: https://render.com
   - Click "Get Started" (top right)
   - Sign up with GitHub (fastest - it will connect to your repos)

2. **Create PostgreSQL Database**
   - After signing in, click "New +" (top right)
   - Select "PostgreSQL"
   - Fill in:
     - **Name**: bakery-ops-db
     - **Database**: bakery_ops
     - **User**: bakery_user
     - **Region**: Oregon (US West) - or closest to you
     - **Plan**: Free
   - Click "Create Database"

3. **Get Database Connection String**
   - Wait 1-2 minutes for database to be created
   - Once created, you'll see "Status: Available"
   - Scroll down to "Connections"
   - Copy the **"External Database URL"** - it looks like:
     ```
     postgresql://bakery_user:XXXXX@dpg-xxxxx.oregon-postgres.render.com/bakery_ops
     ```
   - **SAVE THIS** - you'll need it!

### Part 2: Set Up Database Schema

4. **Connect to Database and Load Schema**
   
   In your Codespace terminal, run:
   ```bash
   cd /workspaces/bakery-ops-app
   
   # Set your Render database URL (replace with yours)
   DATABASE_URL="postgresql://bakery_user:XXXXX@dpg-xxxxx.oregon-postgres.render.com/bakery_ops" npm run setup-db
   ```
   
   You should see:
   ```
   ✅ Database setup complete!
   Default login credentials:
     Username: admin
     Password: admin123
   ```

### Part 3: Deploy Backend to Render

5. **Create Web Service**
   - In Render dashboard, click "New +" again
   - Select "Web Service"
   - Click "Connect a repository"
   - Find your GitHub repo: `bakery-ops-app`
   - Click "Connect"

6. **Configure Web Service**
   Fill in these settings:
   
   - **Name**: `bakery-ops-backend`
   - **Region**: Same as your database (Oregon)
   - **Branch**: `main`
   - **Root Directory**: (leave empty)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

7. **Add Environment Variables**
   Scroll down to "Environment Variables" section and click "Add Environment Variable"
   
   Add these THREE variables:
   
   **Variable 1:**
   - Key: `DATABASE_URL`
   - Value: (paste your Render database URL from step 3)
   
   **Variable 2:**
   - Key: `JWT_SECRET`
   - Value: `super_secret_jwt_key_for_bakery_ops_2024_change_in_production`
   
   **Variable 3:**
   - Key: `NODE_ENV`
   - Value: `production`

8. **Deploy!**
   - Click "Create Web Service"
   - Wait 3-5 minutes for deployment
   - Watch the logs - you should see "Server running on port 5000"
   - Once it says "Live", your backend is ready!

9. **Get Your Backend URL**
   - At the top of the page, you'll see your service URL:
     ```
     https://bakery-ops-backend.onrender.com
     ```
   - **SAVE THIS URL!**

10. **Test Your Backend**
    Open this URL in your browser:
    ```
    https://bakery-ops-backend.onrender.com/api/health
    ```
    
    You should see:
    ```json
    {"status":"ok","timestamp":"2024-..."}
    ```

### Part 4: Connect Frontend to Backend

11. **Update Frontend Environment Variable**
    
    In your Codespace:
    ```bash
    cd /workspaces/bakery-ops-app/client
    
    # Create .env file for frontend
    cat > .env << 'EOF'
    VITE_API_URL=https://bakery-ops-backend.onrender.com
    EOF
    ```
    
    Replace `bakery-ops-backend` with YOUR actual Render service name!

12. **Restart Frontend**
    ```bash
    cd /workspaces/bakery-ops-app
    
    # Kill current servers (Ctrl+C)
    # Restart
    npm run dev
    ```

13. **Test Login!**
    - Go to your frontend (port 3000)
    - Try logging in:
      - Username: `admin`
      - Password: `admin123`
    
    **IT SHOULD WORK NOW!** 🎉

## Troubleshooting

### Backend not starting?
- Check logs in Render dashboard
- Make sure environment variables are set correctly
- Verify Build Command is `npm install`
- Verify Start Command is `npm start`

### Frontend can't connect?
- Make sure VITE_API_URL has https:// and .com at the end
- Restart frontend after changing .env
- Check browser console for errors

### Database connection failing?
- Verify DATABASE_URL is the "External Database URL" from Render
- Check database status is "Available" in Render dashboard
- Make sure you ran the setup-db script

## Free Tier Limits

**PostgreSQL:**
- 1 GB storage (plenty for this app)
- Expires after 90 days (but you can upgrade to keep it free forever)
- Automatic backups

**Web Service:**
- Spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- 750 hours/month (more than enough)

## Next Steps After Deployment

Once everything works:
1. Commit and push the client/.env to your GitHub (it only contains the public backend URL)
2. Deploy frontend to Vercel
3. Add products and start using your bakery system!

## Summary Checklist

- [ ] Sign up for Render.com with GitHub
- [ ] Create PostgreSQL database
- [ ] Copy database connection URL
- [ ] Run setup-db script with Render database URL
- [ ] Create Web Service for backend
- [ ] Add 3 environment variables
- [ ] Deploy backend
- [ ] Get backend URL
- [ ] Update client/.env with backend URL
- [ ] Restart frontend
- [ ] Test login with admin/admin123

Good luck! Let me know if you get stuck on any step! 🚀
