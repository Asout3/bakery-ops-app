-- Database Schema for Bakery Operations App

-- Users table (for authentication and role management)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
    location_id INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Locations/Branches table
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    price DECIMAL(10, 2) NOT NULL,
    cost DECIMAL(10, 2),
    unit VARCHAR(20) DEFAULT 'piece',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory table (current stock levels)
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    location_id INTEGER REFERENCES locations(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    source VARCHAR(20) CHECK (source IN ('baked', 'purchased')),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, location_id)
);

-- Inventory batches (tracking sent batches from manager)
CREATE TABLE IF NOT EXISTS inventory_batches (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id),
    created_by INTEGER REFERENCES users(id),
    batch_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'received')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Batch items (individual products in a batch)
CREATE TABLE IF NOT EXISTS batch_items (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES inventory_batches(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    source VARCHAR(20) CHECK (source IN ('baked', 'purchased')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id),
    cashier_id INTEGER REFERENCES users(id),
    total_amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(20) DEFAULT 'cash',
    sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    receipt_number VARCHAR(50) UNIQUE
);

-- Sale items
CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id),
    category VARCHAR(50) NOT NULL,
    description TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    expense_date DATE NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Staff payments table
CREATE TABLE IF NOT EXISTS staff_payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    location_id INTEGER REFERENCES locations(id),
    amount DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_type VARCHAR(50),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity log (for audit trail and history)
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    location_id INTEGER REFERENCES locations(id),
    activity_type VARCHAR(50) NOT NULL,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    location_id INTEGER REFERENCES locations(id),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sync queue (for offline operations)
CREATE TABLE IF NOT EXISTS sync_queue (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    operation VARCHAR(50) NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed')),
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_inventory_product_location ON inventory(product_id, location_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_location ON sales(location_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_batch_items_batch ON batch_items(batch_id);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);

-- Insert default admin user (password: admin123)
INSERT INTO users (username, email, password_hash, role) 
VALUES ('admin', 'admin@bakery.com', '$2a$10$dn8KZ/YdUSxWjAWlAnK2We/oAbn6LIhLGDsQYurAhjDWkzpLYvmL2', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert sample categories
INSERT INTO categories (name, description) VALUES
('Bread', 'Various types of bread'),
('Pastries', 'Sweet pastries and desserts'),
('Cakes', 'Custom and ready-made cakes'),
('Cookies', 'Assorted cookies'),
('Beverages', 'Drinks and beverages')
ON CONFLICT DO NOTHING;
