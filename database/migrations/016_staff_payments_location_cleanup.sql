UPDATE staff_payments
SET location_id = NULL
WHERE location_id IS NOT NULL;
