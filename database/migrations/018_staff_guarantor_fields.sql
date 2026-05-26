ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS guarantor_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS guarantor_phone_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS guarantor_national_id VARCHAR(100);
