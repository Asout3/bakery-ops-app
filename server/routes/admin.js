import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { validatePassword } from '../middleware/security.js';
import { adminLifecycleRepository } from '../repositories/adminLifecycleRepository.js';
import { createStaffAccount, updateStaffAccount, archiveStaffAccount, archiveStaffProfile } from '../services/adminLifecycleService.js';

const router = express.Router();
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
  body('payment_due_date').optional().isInt({ min: 1, max: 28 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
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
        payment_due_date,
      } = req.body;

      if (national_id) {
        const existingNational = await query('SELECT id FROM staff_profiles WHERE national_id = $1 LIMIT 1', [national_id]);
        if (existingNational.rows.length > 0) return res.status(400).json({ error: 'National ID already exists' });
      }

      const inserted = await query(
        `INSERT INTO staff_profiles
         (full_name, national_id, phone_number, age, monthly_salary, role_preference, job_title, location_id, hire_date, payment_due_date, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
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
          payment_due_date || 25,
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
      if (workedInCycle < 30 && Number(staff.monthly_salary || 0) > 0 && staff.linked_user_id) {
        const proratedAmount = (Number(staff.monthly_salary) / 30) * workedInCycle;
        await query(
          `INSERT INTO staff_payments (user_id, location_id, amount, payment_date, payment_type, notes, created_by)
           VALUES ($1, $2, $3, CURRENT_DATE, 'prorated_exit', $4, $5)`,
          [staff.linked_user_id, staff.location_id, proratedAmount, `Auto prorated payout for ${workedInCycle} day(s) worked in current cycle`, req.user.id]
        );
      }
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Update staff status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/staff/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid staff id' });

    const {
      full_name,
      national_id,
      phone_number,
      age,
      monthly_salary,
      role_preference,
      other_role_title,
      location_id,
      hire_date,
      payment_due_date,
    } = req.body;

    const updated = await query(
      `UPDATE staff_profiles
       SET full_name = COALESCE($1, full_name),
           national_id = $2,
           phone_number = COALESCE($3, phone_number),
           age = $4,
           monthly_salary = COALESCE($5, monthly_salary),
           role_preference = COALESCE($6, role_preference),
           job_title = COALESCE($7, job_title),
           location_id = COALESCE($8, location_id),
           hire_date = COALESCE($9, hire_date),
           payment_due_date = COALESCE($10, payment_due_date),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING *`,
      [
        full_name || null,
        national_id || null,
        phone_number || null,
        age ?? null,
        monthly_salary ?? null,
        role_preference || null,
        role_preference === 'other' ? (other_role_title || null) : role_preference || null,
        location_id ?? null,
        hire_date || null,
        payment_due_date ?? null,
        id,
      ]
    );

    if (!updated.rows.length) return res.status(404).json({ error: 'Staff member not found' });
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Update staff profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/staff/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid staff id' });

    const result = await archiveStaffProfile(id, adminLifecycleRepository);
    res.json(result);
  } catch (err) {
    console.error('Delete staff profile error:', err);
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code, requestId: req.requestId });
    }
    res.status(500).json({ error: 'Internal server error', code: 'STAFF_ARCHIVE_ERROR', requestId: req.requestId });
  }
});

router.get('/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
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

router.get('/staff-for-payments', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = req.query.location_id ? Number(req.query.location_id) : null;
    
    let queryText = `
      SELECT 
        sp.id,
        sp.full_name,
        sp.phone_number,
        sp.monthly_salary,
        sp.role_preference,
        sp.job_title,
        sp.location_id,
        COALESCE(sp.payment_due_date, 25) as payment_due_date,
        sp.is_active,
        sp.hire_date,
        sp.termination_date,
        l.name as location_name,
        u.username as account_username,
        u.role as account_role
      FROM staff_profiles sp
      LEFT JOIN locations l ON l.id = sp.location_id
      LEFT JOIN users u ON u.id = sp.linked_user_id
      WHERE sp.is_active = true
    `;
    
    const params = [];
    if (locationId) {
      params.push(locationId);
      queryText += ` AND sp.location_id = $${params.length}`;
    }
    
    queryText += ` ORDER BY sp.full_name ASC`;
    
    const result = await query(queryText, params);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Get staff for payments error:', err);
    if (err.message && err.message.includes('payment_due_date')) {
      return res.json([]);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/check-salary-due', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    
    const staffDue = await query(`
      SELECT 
        sp.id,
        sp.full_name,
        sp.monthly_salary,
        sp.payment_due_date,
        sp.location_id,
        l.name as location_name
      FROM staff_profiles sp
      LEFT JOIN locations l ON l.id = sp.location_id
      WHERE sp.is_active = true 
        AND sp.monthly_salary > 0
        AND sp.payment_due_date BETWEEN $1 AND $2
      ORDER BY sp.payment_due_date ASC
    `, [currentDay, currentDay + 2]);
    
    const staffList = staffDue.rows.map(s => ({
      id: s.id,
      full_name: s.full_name,
      monthly_salary: Number(s.monthly_salary || 0),
      payment_due_date: s.payment_due_date,
      days_until_due: s.payment_due_date - currentDay,
      location_name: s.location_name
    }));
    
    const notificationsCreated = [];
    if (staffList.length > 0) {
      const admins = await query(`SELECT id FROM users WHERE role = 'admin' AND is_active = true`);
      
      for (const admin of admins.rows) {
        for (const staff of staffList) {
          const daysText = staff.days_until_due === 0 ? 'today' : 
                          staff.days_until_due === 1 ? 'tomorrow' : 
                          `in ${staff.days_until_due} days`;
          
          const existingNotif = await query(`
            SELECT id FROM notifications 
            WHERE user_id = $1 
              AND title LIKE '%Salary payment due%'
              AND message LIKE '%${staff.full_name}%'
              AND created_at >= CURRENT_DATE
            LIMIT 1
          `, [admin.id]);
          
          if (existingNotif.rows.length === 0) {
            await query(`
              INSERT INTO notifications (user_id, location_id, title, message, notification_type)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              admin.id,
              staff.location_id,
              `💰 Salary payment due ${daysText}`,
              `Staff member ${staff.full_name} (${staff.job_title || staff.role_preference}) salary of $${staff.monthly_salary.toFixed(2)} is due ${daysText}. Location: ${staff.location_name || 'N/A'}`,
              'salary_due'
            ]);
            notificationsCreated.push(staff.full_name);
          }
        }
      }
    }
    
    res.json({
      checked: true,
      staff_due: staffList,
      notifications_sent: notificationsCreated.length,
      message: notificationsCreated.length > 0 
        ? `Created notifications for ${notificationsCreated.length} staff members`
        : 'No salary payments due within 2 days'
    });
  } catch (err) {
    console.error('Check salary due error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/users',
  authenticateToken,
  authorizeRoles('admin'),
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(['manager', 'cashier']).withMessage('Role must be manager or cashier'),
  body('location_id').isInt({ min: 1 }).withMessage('Valid location is required'),
  body('staff_profile_id').isInt({ min: 1 }).withMessage('Valid staff profile is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password, role, location_id, staff_profile_id } = req.body;

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        code: 'WEAK_PASSWORD',
        details: passwordCheck.errors
      });
    }

    try {
      const result = await createStaffAccount({ username, password, role, location_id, staff_profile_id }, adminLifecycleRepository);
      res.status(201).json(result);
    } catch (err) {
      console.error('Create admin user error:', err);
      if (err.status) {
        return res.status(err.status).json({ error: err.message, code: err.code, requestId: req.requestId });
      }
      res.status(500).json({ error: 'Internal server error', code: 'ADMIN_USER_CREATE_ERROR', requestId: req.requestId });
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

router.put('/users/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { username, password, role, location_id } = req.body;
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });

    const updated = await updateStaffAccount({ id, username, password, role, location_id }, adminLifecycleRepository);
    if (!updated) return res.status(404).json({ error: 'Account not found' });
    res.json(updated);
  } catch (err) {
    console.error('Update account error:', err);
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code, requestId: req.requestId });
    }
    res.status(500).json({ error: 'Internal server error', code: 'ACCOUNT_UPDATE_ERROR', requestId: req.requestId });
  }
});

router.delete('/users/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id', code: 'INVALID_USER_ID', requestId: req.requestId });

    const result = await archiveStaffAccount(id, adminLifecycleRepository);
    res.json(result);
  } catch (err) {
    console.error('Archive account error:', err);
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code, requestId: req.requestId });
    }
    res.status(500).json({ error: 'Internal server error', code: 'ACCOUNT_ARCHIVE_ERROR', requestId: req.requestId });
  }
});

export default router;
