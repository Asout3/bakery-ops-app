ALTER TABLE products
ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;

CREATE INDEX IF NOT EXISTS idx_products_shelf_life_days ON products(shelf_life_days);

CREATE TABLE IF NOT EXISTS inventory_stock_batches (
    id BIGSERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
    quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
    source VARCHAR(30) NOT NULL DEFAULT 'manual',
    reference_type VARCHAR(30),
    reference_id BIGINT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_inventory_stock_batches_lookup ON inventory_stock_batches(location_id, product_id, expires_at, created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_batches_reference ON inventory_stock_batches(reference_type, reference_id);
