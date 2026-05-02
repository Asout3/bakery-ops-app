CREATE TABLE IF NOT EXISTS sync_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  operation_id TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_username TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  method TEXT,
  endpoint TEXT,
  status TEXT NOT NULL CHECK (status IN ('synced', 'failed', 'conflict', 'needs_review', 'resolved', 'ignored')),
  reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_audit_logs_created_at ON sync_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_audit_logs_location_created ON sync_audit_logs(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_audit_logs_status_created ON sync_audit_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_audit_logs_operation_id ON sync_audit_logs(operation_id);
