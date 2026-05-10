-- Staff profiles decouple HR lifecycle records from login accounts
CREATE TABLE IF NOT EXISTS staff_profiles (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  national_id VARCHAR(60) UNIQUE,
  phone_number VARCHAR(30) NOT NULL,
  age INT,
  monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  role_preference VARCHAR(30) NOT NULL DEFAULT 'cashier',
  job_title VARCHAR(80),
  location_id INT REFERENCES locations(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  termination_date DATE,
  linked_user_id INT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
