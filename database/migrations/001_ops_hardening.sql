-- Idempotency support for offline/retry-safe writes
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id),
  idempotency_key VARCHAR(120) NOT NULL,
  endpoint VARCHAR(120) NOT NULL,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, idempotency_key)
);

-- Inventory movement ledger
CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id),
  product_id INTEGER REFERENCES products(id),
  movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('batch_in', 'sale_out', 'manual_adjustment')),
  quantity_change INTEGER NOT NULL,
  source VARCHAR(20) CHECK (source IN ('baked', 'purchased', 'sale', 'manual')),
  reference_type VARCHAR(30),
  reference_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- KPI event log
CREATE TABLE IF NOT EXISTS kpi_events (
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id),
  user_id INTEGER REFERENCES users(id),
  event_type VARCHAR(60) NOT NULL,
  event_value NUMERIC,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rule-based alerts
CREATE TABLE IF NOT EXISTS alert_rules (
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id),
  event_type VARCHAR(60) NOT NULL,
  threshold NUMERIC NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_location_product ON inventory_movements(location_id, product_id);
CREATE INDEX IF NOT EXISTS idx_kpi_events_type_created_at ON kpi_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_alert_rules_location_event ON alert_rules(location_id, event_type, enabled);
CREATE INDEX IF NOT EXISTS idx_idempotency_user_key ON idempotency_keys(user_id, idempotency_key);
