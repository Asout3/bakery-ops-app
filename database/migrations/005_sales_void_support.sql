-- Add status column to sales table for void support
ALTER TABLE sales ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed' 
  CHECK (status IN ('completed', 'voided', 'refunded'));

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

-- Add void tracking columns
ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_by INTEGER REFERENCES users(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- Update existing sales to have completed status
UPDATE sales SET status = 'completed' WHERE status IS NULL;
