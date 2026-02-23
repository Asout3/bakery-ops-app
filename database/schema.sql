-- Database Schema for Bakery Operations App

-- Users table (for authentication and role management)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
    full_name VARCHAR(120),
    national_id VARCHAR(50),
    phone_number VARCHAR(30),
    age INTEGER,
    monthly_salary NUMERIC(12,2) DEFAULT 0,
    job_title VARCHAR(80),
    hire_date DATE DEFAULT CURRENT_DATE,
    termination_date DATE,
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

-- Staff profiles (HR records without requiring login credentials)
CREATE TABLE IF NOT EXISTS staff_profiles (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    national_id VARCHAR(60) UNIQUE,
    phone_number VARCHAR(30) NOT NULL,
    age INTEGER,
    monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
    role_preference VARCHAR(30) NOT NULL DEFAULT 'cashier',
    job_title VARCHAR(80),
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    hire_date DATE DEFAULT CURRENT_DATE,
    termination_date DATE,
    linked_user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'received', 'edited', 'voided')),
    notes TEXT,
    is_offline BOOLEAN DEFAULT false,
    original_actor_id INTEGER REFERENCES users(id),
    original_actor_name VARCHAR(100),
    synced_by_id INTEGER REFERENCES users(id),
    synced_by_name VARCHAR(100),
    synced_at TIMESTAMP,
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
    is_offline BOOLEAN DEFAULT false,
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

-- Idempotency support for offline/retry-safe writes
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id),
    idempotency_key VARCHAR(120) NOT NULL,
    endpoint VARCHAR(120) NOT NULL,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, idempotency_key)
);

-- Inventory movement ledger
CREATE TABLE IF NOT EXISTS inventory_movements (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id),
    product_id INTEGER REFERENCES products(id),
    movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('batch_in', 'sale_out', 'manual_adjustment')),
    quantity_change INTEGER NOT NULL,
    source VARCHAR(20) CHECK (source IN ('baked', 'purchased', 'sale', 'manual')),
    reference_type VARCHAR(30),
    reference_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- KPI event log
CREATE TABLE IF NOT EXISTS kpi_events (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id),
    user_id INTEGER REFERENCES users(id),
    event_type VARCHAR(60) NOT NULL,
    event_value NUMERIC,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rule-based alerts
CREATE TABLE IF NOT EXISTS alert_rules (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id),
    event_type VARCHAR(60) NOT NULL,
    threshold NUMERIC NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_location_product ON inventory_movements(location_id, product_id);
CREATE INDEX IF NOT EXISTS idx_kpi_events_type_created_at ON kpi_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_alert_rules_location_event ON alert_rules(location_id, event_type, enabled);
CREATE INDEX IF NOT EXISTS idx_idempotency_user_key ON idempotency_keys(user_id, idempotency_key);

-- Multi-branch user access map
CREATE TABLE IF NOT EXISTS user_locations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, location_id)
);

-- Extended KPI fields
ALTER TABLE kpi_events ADD COLUMN IF NOT EXISTS metric_key VARCHAR(80);
ALTER TABLE kpi_events ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_location ON user_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_kpi_events_metric_key ON kpi_events(metric_key, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_national_id_unique ON users (national_id) WHERE national_id IS NOT NULL;
