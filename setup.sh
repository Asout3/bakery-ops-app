#!/bin/bash

# Setup script for Bakery Operations App

echo "Setting up Bakery Operations App..."

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "PostgreSQL is not installed. Please install PostgreSQL first."
    exit 1
fi

# Create database and user
echo "Creating database..."
sudo -u postgres psql << EOF
CREATE DATABASE bakery_ops;
CREATE USER bakery_user WITH ENCRYPTED PASSWORD 'bakery_pass';
GRANT ALL PRIVILEGES ON DATABASE bakery_ops TO bakery_user;
\c bakery_ops
GRANT ALL ON SCHEMA public TO bakery_user;
EOF

# Run database schema
echo "Setting up database schema..."
PGPASSWORD=bakery_pass psql -U bakery_user -d bakery_ops -f database/schema.sql

# Install backend dependencies
echo "Installing backend dependencies..."
npm install

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd client && npm install && cd ..

echo ""
echo "Setup complete!"
echo ""
echo "To start the application:"
echo "1. Backend: npm run server"
echo "2. Frontend: npm run client"
echo "Or run both: npm run dev"
echo ""
echo "Default login credentials:"
echo "Username: admin"
echo "Password: admin123"
