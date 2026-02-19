import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();
let schemaReadyPromise;

function ensureSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS full_name VARCHAR(120),
          ADD COLUMN IF NOT EXISTS national_id VARCHAR(60),
          ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30),
          ADD COLUMN IF NOT EXISTS age INT,
          ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS job_title VARCHAR(80),
          ADD COLUMN IF NOT EXISTS hire_date DATE DEFAULT CURRENT_DATE,
          ADD COLUMN IF NOT EXISTS termination_date DATE
      `);

      await query(`
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
        )
      `);
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }

  return schemaReadyPromise;
}

function roleRank(role, jobTitle) {
  if (role === 'admin') return 1;
  if (role === 'manager') return 2;
  if (role === 'cashier') return 3;
  if (jobTitle && !['manager', 'cashier', 'admin'].includes(role)) return 4;
  return 5;
}

async function createTerminationSecurityNotification(staff) {
  const role = staff.account_role || staff.role_preference || staff.role;
  if (!['manager', 'cashier'].includes(role)) return;

  const admins = await query('SELECT id, location_id FROM users WHERE role = $1 AND is_active = true', ['admin']);
  for (const admin of admins.rows) {
    await query(
      `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        admin.id,
        admin.location_id || staff.location_id,
        'HIGH PRIORITY: Credential Rotation Required',
        `Action Required: Revoke/Change credentials for ${staff.full_name || staff.username} + ${staff.job_title || role} immediately.`,
        'security',
      ]
    );
  }
}

router.get('/staff', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    await ensureSchemaReady();
    const result = await query(
      `SELECT sp.*, l.name AS location_name, u.username AS account_username, u.role AS account_role, u.is_active AS account_active
       FROM staff_profiles sp
       LEFT JOIN locations l ON l.id = sp.location_id
       LEFT JOIN users u ON u.id = sp.linked_user_id
       ORDER BY sp.is_active DESC, sp.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get staff profiles error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/staff',
  authenticateToken,
  authorizeRoles('admin'),
  body('full_name').trim().isLength({ min: 3 }),
  body('phone_number').trim().isLength({ min: 8 }),
  body('role_preference').isIn(['cashier', 'manager', 'other']),
  body('location_id').isInt({ min: 1 }),
  body('age').optional().isInt({ min: 15, max: 100 }),
  body('monthly_salary').optional().isFloat({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      await ensureSchemaReady();
      const {
        full_name,
        national_id,
        phone_number,
        age,
        monthly_salary,
        role_preference,
        location_id,
        other_role_title,
        hire_date,
      } = req.body;

      if (national_id) {
        const existingNational = await query('SELECT id FROM staff_profiles WHERE national_id = $1 LIMIT 1', [national_id]);
        if (existingNational.rows.length > 0) return res.status(400).json({ error: 'National ID already exists' });
      }

      const inserted = await query(
        `INSERT INTO staff_profiles
         (full_name, national_id, phone_number, age, monthly_salary, role_preference, job_title, location_id, hire_date, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
         RETURNING *`,
        [
          full_name,
          national_id || null,
          phone_number,
          age || null,
          monthly_salary || 0,
          role_preference,
          role_preference === 'other' ? (other_role_title || 'Other Staff') : role_preference,
          location_id,
          hire_date || new Date().toISOString().slice(0, 10),
        ]
      );

      res.status(201).json(inserted.rows[0]);
    } catch (err) {
      console.error('Create staff profile error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.patch('/staff/:id/status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    await ensureSchemaReady();
    const id = Number(req.params.id);
    const { is_active } = req.body;
    if (!Number.isInteger(id) || typeof is_active !== 'boolean') return res.status(400).json({ error: 'Invalid payload' });

    const current = await query(
      `SELECT sp.*, u.username, u.role AS account_role
       FROM staff_profiles sp
       LEFT JOIN users u ON u.id = sp.linked_user_id
       WHERE sp.id = $1`,
      [id]
    );
    if (!current.rows.length) return res.status(404).json({ error: 'Staff member not found' });
    const staff = current.rows[0];

    const updated = await query(
      `UPDATE staff_profiles
       SET is_active = $1,
           termination_date = CASE WHEN $1 = false THEN CURRENT_DATE ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [is_active, id]
    );

    if (staff.linked_user_id) {
      await query('UPDATE users SET is_active = $1, termination_date = CASE WHEN $1 = false THEN CURRENT_DATE ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [is_active, staff.linked_user_id]);
    }

    if (!is_active) {
      await createTerminationSecurityNotification(staff);
      const hireDate = new Date(staff.hire_date || Date.now());
      const termDate = new Date();
      const daysSinceHire = Math.max(0, Math.floor((termDate - hireDate) / (1000 * 60 * 60 * 24)));
      const workedInCycle = (daysSinceHire % 30) + 1;
      if (workedInCycle < 30 && Number(staff.monthly_salary || 0) > 0) {
        const proratedAmount = (Number(staff.monthly_salary) / 30) * workedInCycle;
        await query(
          `INSERT INTO staff_payments (user_id, location_id, amount, payment_date, payment_type, notes, created_by)
           VALUES ($1, $2, $3, CURRENT_DATE, 'prorated_exit', $4, $5)`,
          [staff.linked_user_id || req.user.id, staff.location_id, proratedAmount, `Auto prorated payout for ${workedInCycle} day(s) worked in current cycle`, req.user.id]
        );
      }
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Update staff status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    await ensureSchemaReady();
    const result = await query(
      `SELECT u.id, u.username, u.email, u.role, u.location_id, u.is_active, u.created_at,
              COALESCE(sp.full_name, u.full_name, u.username) AS full_name,
              COALESCE(sp.national_id, u.national_id) AS national_id,
              COALESCE(sp.phone_number, u.phone_number) AS phone_number,
              COALESCE(sp.age, u.age) AS age,
              COALESCE(sp.monthly_salary, u.monthly_salary, 0) AS monthly_salary,
              COALESCE(sp.job_title, u.job_title, u.role) AS job_title,
              COALESCE(sp.hire_date, u.hire_date) AS hire_date,
              COALESCE(sp.termination_date, u.termination_date) AS termination_date,
              sp.id AS staff_profile_id,
              l.name AS location_name
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.linked_user_id = u.id
       LEFT JOIN locations l ON l.id = u.location_id
       WHERE u.role IN ('manager', 'cashier')
       ORDER BY u.created_at DESC`
    );

    const sorted = [...result.rows].sort((a, b) => {
      const rankDiff = roleRank(a.role, a.job_title) - roleRank(b.role, b.job_title);
      if (rankDiff !== 0) return rankDiff;
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return (a.full_name || a.username).localeCompare(b.full_name || b.username);
    });

    res.json(sorted);
  } catch (err) {
    console.error('Get admin users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users/:id/profile', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    await ensureSchemaReady();
    const staff = await query(
      `SELECT u.id, u.username, u.role, u.is_active,
              COALESCE(sp.full_name, u.full_name, u.username) AS full_name,
              COALESCE(sp.phone_number, u.phone_number) AS phone_number,
              COALESCE(sp.monthly_salary, u.monthly_salary, 0) AS monthly_salary,
              COALESCE(sp.job_title, u.job_title, u.role) AS job_title,
              COALESCE(sp.hire_date, u.hire_date) AS hire_date,
              COALESCE(sp.termination_date, u.termination_date) AS termination_date
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.linked_user_id = u.id
       WHERE u.id = $1`,
      [req.params.id]
    );

    if (!staff.rows.length) return res.status(404).json({ error: 'Staff not found' });

    const payments = await query(
      `SELECT id, amount, payment_date, payment_type, notes, created_at
       FROM staff_payments
       WHERE user_id = $1
       ORDER BY payment_date DESC, created_at DESC
       LIMIT 50`,
      [req.params.id]
    );

    res.json({ staff: staff.rows[0], payments: payments.rows, activities: [] });
  } catch (err) {
    console.error('Get staff profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/staff-expense-summary', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    await ensureSchemaReady();
    const activeSalary = await query(
      `SELECT COALESCE(SUM(monthly_salary), 0) AS total_active_salary
       FROM staff_profiles
       WHERE is_active = true`
    );

    const prorated = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_prorated
       FROM staff_payments
       WHERE payment_type = 'prorated_exit' AND DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)`
    );

    res.json({
      total_monthly_staff_expense: Number(activeSalary.rows[0].total_active_salary || 0) + Number(prorated.rows[0].total_prorated || 0),
      active_salary_total: Number(activeSalary.rows[0].total_active_salary || 0),
      prorated_exit_total: Number(prorated.rows[0].total_prorated || 0),
    });
  } catch (err) {
    console.error('Get staff expense summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/users',
  authenticateToken,
  authorizeRoles('admin'),
  body('username').trim().isLength({ min: 3 }),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['manager', 'cashier']),
  body('location_id').isInt({ min: 1 }),
  body('staff_profile_id').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password, role, location_id, staff_profile_id } = req.body;

    try {
      await ensureSchemaReady();
      const staffResult = await query('SELECT * FROM staff_profiles WHERE id = $1', [staff_profile_id]);
      if (!staffResult.rows.length) return res.status(404).json({ error: 'Staff profile not found' });
      const staff = staffResult.rows[0];

      const resolvedEmail = `${(staff.phone_number || username).replace(/[^0-9+]/g, '') || username}@phone.local`;
      const exists = await query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, resolvedEmail]);
      if (exists.rows.length > 0) return res.status(400).json({ error: 'Username or phone already exists' });

      const password_hash = await bcrypt.hash(password, 10);
      const inserted = await query(
        `INSERT INTO users
         (username, email, password_hash, role, location_id, full_name, national_id, phone_number, age, monthly_salary, job_title, hire_date, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
         RETURNING id, username, email, role, location_id, is_active, created_at, full_name, phone_number, age, monthly_salary, job_title, hire_date`,
        [
          username,
          resolvedEmail,
          password_hash,
          role,
          location_id,
          staff.full_name,
          staff.national_id,
          staff.phone_number,
          staff.age,
          staff.monthly_salary,
          staff.job_title,
          staff.hire_date || new Date().toISOString().slice(0, 10),
        ]
      );

      await query(`INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [inserted.rows[0].id, location_id]);
      await query(`UPDATE staff_profiles SET linked_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [inserted.rows[0].id, staff_profile_id]);

      res.status(201).json({ ...inserted.rows[0], staff_profile_id });
    } catch (err) {
      console.error('Create admin user error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.patch('/users/:id/status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    await ensureSchemaReady();
    const id = Number(req.params.id);
    const { is_active } = req.body;

    if (!Number.isInteger(id) || typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const current = await query(
      `SELECT u.id, u.username, u.role, u.location_id, u.is_active, u.monthly_salary, u.hire_date,
              COALESCE(sp.full_name, u.full_name, u.username) AS full_name,
              COALESCE(sp.job_title, u.job_title, u.role) AS job_title,
              sp.id AS staff_profile_id
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.linked_user_id = u.id
       WHERE u.id = $1 AND u.role IN ('manager', 'cashier')`,
      [id]
    );
    if (!current.rows.length) return res.status(404).json({ error: 'Staff member not found' });

    const staff = current.rows[0];

    const updated = await query(
      `UPDATE users
       SET is_active = $1,
           termination_date = CASE WHEN $1 = false THEN CURRENT_DATE ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, username, email, role, location_id, is_active, created_at, full_name, phone_number, age, monthly_salary, job_title, hire_date, termination_date`,
      [is_active, id]
    );

    if (staff.staff_profile_id) {
      await query(
        `UPDATE staff_profiles
         SET is_active = $1,
             termination_date = CASE WHEN $1 = false THEN CURRENT_DATE ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [is_active, staff.staff_profile_id]
      );
    }

    if (!is_active) {
      await createTerminationSecurityNotification({ ...staff, is_active });
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
