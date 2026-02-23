ALTER TABLE inventory_batches
  DROP CONSTRAINT IF EXISTS inventory_batches_status_check;

ALTER TABLE inventory_batches
  ADD CONSTRAINT inventory_batches_status_check
  CHECK (status IN ('pending', 'sent', 'received', 'edited', 'voided'));
