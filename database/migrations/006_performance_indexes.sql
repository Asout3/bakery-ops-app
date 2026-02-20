-- Migration: 006_performance_indexes.sql
-- Description: Add indexes to improve query performance
-- NOTE: Only creates indexes for columns that exist in the schema

-- Indexes for auth and user lookups (common slow queries)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_location_id ON users(location_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Indexes for sales (most common reports)
CREATE INDEX IF NOT EXISTS idx_sales_location_id ON sales(location_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_location_date ON sales(location_id, (sale_date::date));
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);

-- Indexes for sale_items
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- Indexes for expenses
CREATE INDEX IF NOT EXISTS idx_expenses_location_id ON expenses(location_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- Indexes for staff_payments
CREATE INDEX IF NOT EXISTS idx_staff_payments_user_id ON staff_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_payments_location_id ON staff_payments(location_id);
CREATE INDEX IF NOT EXISTS idx_staff_payments_payment_date ON staff_payments(payment_date);

-- Indexes for staff_profiles
CREATE INDEX IF NOT EXISTS idx_staff_profiles_location_id ON staff_profiles(location_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_linked_user_id ON staff_profiles(linked_user_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_is_active ON staff_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_national_id ON staff_profiles(national_id);

-- Indexes for kpi_events (slow query: AVG(duration_ms))
CREATE INDEX IF NOT EXISTS idx_kpi_events_location_id ON kpi_events(location_id);
CREATE INDEX IF NOT EXISTS idx_kpi_events_metric_key ON kpi_events(metric_key);
CREATE INDEX IF NOT EXISTS idx_kpi_events_created_at ON kpi_events(created_at);
CREATE INDEX IF NOT EXISTS idx_kpi_events_location_metric ON kpi_events(location_id, metric_key, created_at);

-- Indexes for products (global catalog - no location_id)
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- Indexes for inventory
CREATE INDEX IF NOT EXISTS idx_inventory_location_id ON inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);

-- Indexes for locations
CREATE INDEX IF NOT EXISTS idx_locations_is_active ON locations(is_active);

-- Composite index for user auth (most common lookup)
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active) WHERE role IN ('admin', 'manager');

-- Index for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_location_id ON notifications(location_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
