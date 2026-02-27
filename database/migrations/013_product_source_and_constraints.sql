ALTER TABLE products
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'baked'
  CHECK (source IN ('baked', 'purchased'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unique_ci ON products (LOWER(name));
