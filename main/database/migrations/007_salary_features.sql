-- Migration: 007_salary_features.sql
-- Description: Add salary payment features, offline tracking, and payment due dates

-- 1. Add is_offline to track if sale was made offline
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_offline BOOLEAN DEFAULT false;

-- 2. Add payment_due_date to staff_profiles (1-28, default 25th)
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS payment_due_date INTEGER DEFAULT 25 CHECK (payment_due_date BETWEEN 1 AND 28);

-- 3. Add staff_profile_id to staff_payments for non-account staff
ALTER TABLE staff_payments ADD COLUMN IF NOT EXISTS staff_profile_id INTEGER REFERENCES staff_profiles(id);

-- 4. Create index for payment due date queries
CREATE INDEX IF NOT EXISTS idx_staff_profiles_payment_due ON staff_profiles(payment_due_date) WHERE is_active = true;

-- 5. Create index for offline sales
CREATE INDEX IF NOT EXISTS idx_sales_is_offline ON sales(is_offline) WHERE is_offline = true;
