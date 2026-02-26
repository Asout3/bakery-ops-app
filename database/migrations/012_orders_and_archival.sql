CREATE TABLE IF NOT EXISTS customer_orders (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(120) NOT NULL,
    customer_phone VARCHAR(30) NOT NULL,
    customer_note TEXT,
    order_details TEXT NOT NULL,
    pickup_at TIMESTAMP NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'mobile')),
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled', 'overdue')),
    baked_done BOOLEAN NOT NULL DEFAULT false,
    baked_done_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    baked_done_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_orders_location_pickup ON customer_orders(location_id, pickup_at);
CREATE INDEX IF NOT EXISTS idx_customer_orders_status_pickup ON customer_orders(status, pickup_at);
CREATE INDEX IF NOT EXISTS idx_customer_orders_created_at ON customer_orders(created_at);

CREATE TABLE IF NOT EXISTS archive_settings (
    id SERIAL PRIMARY KEY,
    location_id INTEGER UNIQUE REFERENCES locations(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    retention_months INTEGER NOT NULL DEFAULT 6,
    cold_storage_after_months INTEGER NOT NULL DEFAULT 24,
    require_confirmation_phrase BOOLEAN NOT NULL DEFAULT true,
    confirmation_phrase VARCHAR(120) NOT NULL DEFAULT 'I CONFIRM TO ARCHIVE THE LAST 6 MONTH HISTORY',
    last_run_at TIMESTAMP,
    last_reminder_at TIMESTAMP,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS archive_runs (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    triggered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    run_type VARCHAR(20) NOT NULL CHECK (run_type IN ('scheduled', 'manual')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
    cutoff_at TIMESTAMP NOT NULL,
    details JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_archive (LIKE sales INCLUDING ALL);
CREATE TABLE IF NOT EXISTS sale_items_archive (LIKE sale_items INCLUDING ALL);
CREATE TABLE IF NOT EXISTS inventory_movements_archive (LIKE inventory_movements INCLUDING ALL);
CREATE TABLE IF NOT EXISTS activity_log_archive (LIKE activity_log INCLUDING ALL);
CREATE TABLE IF NOT EXISTS expenses_archive (LIKE expenses INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staff_payments_archive (LIKE staff_payments INCLUDING ALL);

CREATE INDEX IF NOT EXISTS idx_sales_archive_sale_date ON sales_archive(sale_date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_archive_created_at ON inventory_movements_archive(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_archive_created_at ON activity_log_archive(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_archive_expense_date ON expenses_archive(expense_date);
CREATE INDEX IF NOT EXISTS idx_staff_payments_archive_payment_date ON staff_payments_archive(payment_date);
