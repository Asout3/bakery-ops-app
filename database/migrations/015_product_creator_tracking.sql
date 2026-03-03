ALTER TABLE products
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);
