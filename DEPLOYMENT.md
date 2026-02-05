# Deployment Guide for Bakery Operations App

## Quick Start - Local Development

The app is currently running!
- **Frontend**: http://localhost:3001
- **Backend**: http://localhost:5000

## Deploy Frontend to Vercel

### Step 1: Prepare Frontend for Deployment

The frontend is already configured to work with environment variables.

### Step 2: Deploy to Vercel

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Navigate to the client folder
cd client

# Deploy
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? bakery-ops-frontend
# - Directory? ./
# - Override settings? No
```

### Step 3: Set Environment Variable on Vercel

After deployment, you need to tell the frontend where your backend is:

1. Go to your Vercel dashboard: https://vercel.com/dashboard
2. Select your project
3. Go to "Settings" → "Environment Variables"
4. Add this variable:
   - **Name**: `VITE_API_URL`
   - **Value**: Your backend URL (see backend deployment below)
5. Redeploy the frontend

## Deploy Backend Options

### Option 1: Deploy Backend to Render.com (Recommended - Free Tier Available)

1. Go to https://render.com
2. Sign up / Sign in
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Configure:
   - **Name**: bakery-ops-backend
   - **Root Directory**: leave empty
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     ```
     PORT=5000
     DATABASE_URL=postgresql://your_db_url
     JWT_SECRET=your_secret_key_here
     NODE_ENV=production
     ```
6. Add PostgreSQL database:
   - Click "New +" → "PostgreSQL"
   - Copy the connection URL
   - Add it to your web service's `DATABASE_URL` variable

### Option 2: Deploy Backend to Railway.app

1. Go to https://railway.app
2. Sign up / Sign in
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Add PostgreSQL:
   - Click "New" → "Database" → "PostgreSQL"
6. Add environment variables (same as above)

### Option 3: Deploy Backend to Heroku

```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login to Heroku
heroku login

# Create app
heroku create bakery-ops-backend

# Add PostgreSQL
heroku addons:create heroku-postgresql:hobby-dev

# Set environment variables
heroku config:set JWT_SECRET=your_secret_key_here
heroku config:set NODE_ENV=production

# Deploy
git push heroku main
```

## Complete Deployment Flow

### Step-by-Step:

1. **Deploy Backend First**:
   - Choose Render, Railway, or Heroku
   - Get your backend URL (e.g., `https://bakery-ops-backend.onrender.com`)

2. **Update Frontend Environment**:
   - Set `VITE_API_URL` on Vercel to your backend URL
   - Example: `https://bakery-ops-backend.onrender.com`

3. **Deploy Frontend to Vercel**:
   - Run `vercel` in the client folder
   - Get your frontend URL (e.g., `https://bakery-ops.vercel.app`)

4. **Update Backend CORS** (if needed):
   - Add your Vercel URL to allowed origins

## Without Database Setup (Testing Only)

If you want to deploy and test the UI without setting up a database:

### Mock Backend Option

I can create a simple mock backend that returns sample data so you can see the frontend working on Vercel without needing PostgreSQL.

Would you like me to:
1. Create a mock backend for testing?
2. Help you set up a real database on a free service?
3. Modify the frontend to work in "demo mode" with fake data?

## Current Setup for GitHub Codespaces

Since you're on Codespaces:

1. **Access Frontend**: 
   - Codespaces should show you a popup with the port 3001 URL
   - Or go to "Ports" tab and click the URL for port 3001

2. **Access Backend**:
   - Same for port 5000

3. **Login Credentials**:
   - Username: `admin`
   - Password: `admin123`

Let me know which deployment option you prefer!
