#!/bin/bash

echo "=== BAKERY OPS APP - DATABASE CONNECTION FIX ==="
echo

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "Please create a .env file with your DATABASE_URL"
    exit 1
fi

echo "✅ .env file found"
echo

# Check DATABASE_URL
DATABASE_URL=$(grep "DATABASE_URL" .env | cut -d'=' -f2-)
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not found in .env file"
    exit 1
fi

echo "✅ DATABASE_URL found in .env"
echo "Connection string preview: ${DATABASE_URL:0:60}..."
echo

# Test the connection
echo "Testing database connection..."
node server/env-test.js

if [ $? -eq 0 ]; then
    echo
    echo "✅ Database connection successful!"
    echo "You can now run: npm run dev"
else
    echo
    echo "❌ Database connection failed!"
    echo "Possible solutions:"
    echo "1. Check if your Neon database is active (not paused)"
    echo "2. Verify your DATABASE_URL is correct"
    echo "3. Get a fresh connection string from Neon dashboard"
    echo "4. Check your internet connection"
fi