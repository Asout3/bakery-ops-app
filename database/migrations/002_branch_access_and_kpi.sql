CREATE TABLE IF NOT EXISTS user_locations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, location_id)
);

ALTER TABLE kpi_events ADD COLUMN IF NOT EXISTS metric_key VARCHAR(80);
ALTER TABLE kpi_events ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_location ON user_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_kpi_events_metric_key ON kpi_events(metric_key, created_at);
