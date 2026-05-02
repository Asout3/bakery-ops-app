ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS client_transaction_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS receipt_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS receipt_template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS receipt_generated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_transaction_id ON sales(client_transaction_id) WHERE client_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS receipt_templates (
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipt_settings (
  id SERIAL PRIMARY KEY,
  scope_key VARCHAR(80) NOT NULL UNIQUE,
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  active_template_id INTEGER REFERENCES receipt_templates(id) ON DELETE SET NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_print_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(80) NOT NULL UNIQUE,
  sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
  client_transaction_id VARCHAR(80),
  receipt_number VARCHAR(50),
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(100),
  attempt_type VARCHAR(30) NOT NULL CHECK (attempt_type IN ('original', 'manual_reprint', 'void_reprint', 'test')),
  adapter_mode VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'cancelled', 'previewed')),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_print_events_sale_id ON sale_print_events(sale_id, initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_print_events_client_tx ON sale_print_events(client_transaction_id, initiated_at DESC);
