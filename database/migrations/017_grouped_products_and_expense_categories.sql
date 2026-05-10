ALTER TABLE products
  ADD COLUMN IF NOT EXISTS group_name VARCHAR(100);

UPDATE products
SET group_name = CASE
  WHEN POSITION(' - ' IN name) > 0 THEN SPLIT_PART(name, ' - ', 1)
  ELSE name
END
WHERE group_name IS NULL;

ALTER TABLE products
  ALTER COLUMN group_name SET NOT NULL;

CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(location_id, name)
);

INSERT INTO expense_categories (location_id, name, created_by)
SELECT DISTINCT e.location_id, e.category, MIN(e.created_by)
FROM expenses e
LEFT JOIN expense_categories ec ON ec.location_id = e.location_id AND LOWER(ec.name) = LOWER(e.category)
WHERE ec.id IS NULL
GROUP BY e.location_id, e.category;
