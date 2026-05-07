DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_total_amount_nonnegative') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_total_amount_nonnegative CHECK (total_amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_quantity_positive') THEN
    ALTER TABLE sale_items ADD CONSTRAINT sale_items_quantity_positive CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_unit_price_nonnegative') THEN
    ALTER TABLE sale_items ADD CONSTRAINT sale_items_unit_price_nonnegative CHECK (unit_price >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_subtotal_nonnegative') THEN
    ALTER TABLE sale_items ADD CONSTRAINT sale_items_subtotal_nonnegative CHECK (subtotal >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_amount_nonnegative') THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_amount_nonnegative CHECK (amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_payments_amount_nonnegative') THEN
    ALTER TABLE staff_payments ADD CONSTRAINT staff_payments_amount_nonnegative CHECK (amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_price_nonnegative') THEN
    ALTER TABLE products ADD CONSTRAINT products_price_nonnegative CHECK (price >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_nonnegative') THEN
    ALTER TABLE products ADD CONSTRAINT products_cost_nonnegative CHECK (cost IS NULL OR cost >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batch_items_quantity_positive') THEN
    ALTER TABLE batch_items ADD CONSTRAINT batch_items_quantity_positive CHECK (quantity > 0) NOT VALID;
  END IF;
END $$;

ALTER TABLE sales VALIDATE CONSTRAINT sales_total_amount_nonnegative;
ALTER TABLE sale_items VALIDATE CONSTRAINT sale_items_quantity_positive;
ALTER TABLE sale_items VALIDATE CONSTRAINT sale_items_unit_price_nonnegative;
ALTER TABLE sale_items VALIDATE CONSTRAINT sale_items_subtotal_nonnegative;
ALTER TABLE expenses VALIDATE CONSTRAINT expenses_amount_nonnegative;
ALTER TABLE staff_payments VALIDATE CONSTRAINT staff_payments_amount_nonnegative;
ALTER TABLE products VALIDATE CONSTRAINT products_price_nonnegative;
ALTER TABLE products VALIDATE CONSTRAINT products_cost_nonnegative;
ALTER TABLE batch_items VALIDATE CONSTRAINT batch_items_quantity_positive;
