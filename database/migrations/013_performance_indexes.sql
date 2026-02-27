CREATE INDEX IF NOT EXISTS idx_inventory_batches_location_created_at
  ON inventory_batches(location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_location_status_created_at
  ON inventory_batches(location_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_batch_items_batch_id
  ON batch_items(batch_id);

CREATE INDEX IF NOT EXISTS idx_sales_location_sale_date
  ON sales(location_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_archive_runs_location_created
  ON archive_runs(location_id, created_at DESC);
