ALTER TABLE products
ADD COLUMN IF NOT EXISTS expiration_date DATE;

CREATE INDEX IF NOT EXISTS idx_products_expiration_date ON products(expiration_date);

CREATE TABLE IF NOT EXISTS waste_records (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    quantity_wasted INTEGER NOT NULL CHECK (quantity_wasted > 0),
    cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_loss NUMERIC(12,2) NOT NULL DEFAULT 0,
    reason VARCHAR(30) NOT NULL DEFAULT 'expired',
    wasted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_waste_records_location_time ON waste_records(location_id, wasted_at DESC);
CREATE INDEX IF NOT EXISTS idx_waste_records_product_time ON waste_records(product_id, wasted_at DESC);
