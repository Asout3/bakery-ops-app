ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS original_actor_id INTEGER REFERENCES users(id);
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS original_actor_name VARCHAR(100);
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS synced_by_id INTEGER REFERENCES users(id);
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS synced_by_name VARCHAR(100);
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_inventory_batches_original_actor ON inventory_batches(original_actor_id);
