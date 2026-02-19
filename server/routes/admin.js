import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

function roleRank(role, jobTitle) {
  if (role === 'admin') return 1;
  if (role === 'manager') return 2;
  if (role === 'cashier') return 3;
  if (jobTitle && !['manager', 'cashier', 'admin'].includes(role)) return 4;
  return 5;
}

async function createTerminationSecurityNotification(staff) {
  if (!['manager', 'cashier'].includes(staff.role)) return;

  const admins = await query('SELECT id, location_id FROM users WHERE role = $1 AND is_active = true', ['admin']);
  for (const admin of admins.rows) {
    await query(
      `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        admin.id,
        admin.location_id || staff.location_id,
        'HIGH PRIORITY: Credential Rotation Required',
        `Action Required: Revoke/Change credentials for ${staff.full_name || staff.username} + ${staff.job_title || staff.role} immediately.`,
        'security',
      ]
    );
  }
}

async function maybeCreatePayrollReminder(staff) {
  if (!staff.is_active || !staff.monthly_salary) return;
  const hireDate = new Date(staff.hire_date || Date.now());
  const today = new Date();
  const daysSinceHire = Math.floor((today - hireDate) / (1000 * 60 * 60 * 24));
  const daysUntilPay = 30 - (daysSinceHire % 30);
  if (daysUntilPay !== 3) return;

  const exists = await query(
    `SELECT id FROM notifications
     WHERE user_id = $1 AND title = $2 AND DATE(created_at) = CURRENT_DATE
     LIMIT 1`,
    [
      1,
      `Payroll Reminder: ${staff.full_name || staff.username}`,
    ]
  ).catch(() => ({ rows: [] }));

  if (exists.rows.length > 0) return;

  const admins = await query('SELECT id, location_id FROM users WHERE role = $1 AND is_active = true', ['admin']);
  for (const admin of admins.rows) {
    await query(
      `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        admin.id,
        admin.location_id || staff.location_id,
        `Payroll Reminder: ${staff.full_name || staff.username}`,
        `${staff.full_name || staff.username} reaches 30-day pay date in 3 days.`,
        'payment',
      ]
    );
  }
}

router.get('/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email, u.role, u.location_id, u.is_active, u.created_at,
              u.full_name, u.national_id, u.phone_number, u.age, u.monthly_salary, u.job_title, u.hire_date, u.termination_date,
              l.name AS location_name
       FROM users u
       LEFT JOIN locations l ON l.id = u.location_id
       ORDER BY u.created_at DESC`
    );

    for (const row of result.rows.filter((u) => ['manager', 'cashier'].includes(u.role) || u.job_title)) {
      await maybeCreatePayrollReminder(row);
    }

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
    const staff = await query(
      `SELECT id, username, role, is_active, full_name, phone_number, monthly_salary, job_title, hire_date, termination_date
       FROM users WHERE id = $1`,
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

    const activities = await query(
      `SELECT id, activity_type, description, created_at
       FROM activity_log
       WHERE metadata->>'user_id' = $1 OR description ILIKE $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [String(req.params.id), `%user ${req.params.id}%`]
    ).catch(() => ({ rows: [] }));

    res.json({ staff: staff.rows[0], payments: payments.rows, activities: activities.rows });
  } catch (err) {
    console.error('Get staff profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/staff-expense-summary', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const activeSalary = await query(
      `SELECT COALESCE(SUM(monthly_salary), 0) AS total_active_salary
       FROM users
       WHERE is_active = true AND role IN ('cashier', 'manager')`
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
  body('phone_number').trim().isLength({ min: 8 }),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['manager', 'cashier', 'other']),
  body('location_id').isInt({ min: 1 }),
  body('full_name').trim().isLength({ min: 3 }),
  body('age').optional().isInt({ min: 15, max: 100 }),
  body('monthly_salary').optional().isFloat({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      username,
      phone_number,
      password,
      role,
      location_id,
      full_name,
      age,
      monthly_salary,
      national_id,
      other_role_title,
      hire_date,
    } = req.body;

    try {
      const resolvedEmail = `${phone_number.replace(/[^0-9+]/g, '') || username}@phone.local`;
      const exists = await query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, resolvedEmail]);
      if (exists.rows.length > 0) return res.status(400).json({ error: 'Username or phone already exists' });

      if (national_id) {
        const existingNational = await query('SELECT id FROM users WHERE national_id = $1 LIMIT 1', [national_id]);
        if (existingNational.rows.length > 0) return res.status(400).json({ error: 'National ID already exists' });
      }

      const password_hash = await bcrypt.hash(password, 10);
      const canonicalRole = role === 'other' ? 'cashier' : role;
      const jobTitle = role === 'other' ? (other_role_title || 'Other Staff') : role;

      const inserted = await query(
        `INSERT INTO users
         (username, email, password_hash, role, location_id, full_name, national_id, phone_number, age, monthly_salary, job_title, hire_date, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
         RETURNING id, username, email, role, location_id, is_active, created_at, full_name, phone_number, age, monthly_salary, job_title, hire_date`,
        [username, resolvedEmail, password_hash, canonicalRole, location_id, full_name, national_id || null, phone_number, age || null, monthly_salary || 0, jobTitle, hire_date || new Date().toISOString().slice(0, 10)]
      );

      await query(`INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [inserted.rows[0].id, location_id]);
      res.status(201).json(inserted.rows[0]);
    } catch (err) {
      console.error('Create admin user error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.patch('/users/:id/status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { is_active } = req.body;

    if (!Number.isInteger(id) || typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const current = await query(
      `SELECT id, username, full_name, role, job_title, location_id, is_active, monthly_salary, hire_date
       FROM users WHERE id = $1 AND role IN ('manager', 'cashier')`,
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

    if (!is_active) {
      await createTerminationSecurityNotification({ ...staff, is_active });

      // Pro-rated exit payout if leaving before cycle completion
      const hireDate = new Date(staff.hire_date || Date.now());
      const termDate = new Date();
      const daysSinceHire = Math.max(0, Math.floor((termDate - hireDate) / (1000 * 60 * 60 * 24)));
      const workedInCycle = (daysSinceHire % 30) + 1;
      if (workedInCycle < 30 && Number(staff.monthly_salary || 0) > 0) {
        const proratedAmount = (Number(staff.monthly_salary) / 30) * workedInCycle;
        await query(
          `INSERT INTO staff_payments (user_id, location_id, amount, payment_date, payment_type, notes, created_by)
           VALUES ($1, $2, $3, CURRENT_DATE, 'prorated_exit', $4, $5)`,
          [staff.id, staff.location_id, proratedAmount, `Auto prorated payout for ${workedInCycle} day(s) worked in current cycle`, req.user.id]
        );
      }
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
