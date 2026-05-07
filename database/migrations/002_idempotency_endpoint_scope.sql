ALTER TABLE idempotency_keys
  DROP CONSTRAINT IF EXISTS idempotency_keys_user_id_idempotency_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_user_key_endpoint
  ON idempotency_keys(user_id, idempotency_key, endpoint);
