import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles, generateToken } from '../middleware/auth.js';
import { authLimiter, strictLimiter, validatePassword } from '../middleware/security.js';

const router = express.Router();

const SALT_ROUNDS = 12;

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

const registerValidation = [
  body('username')
    .trim()
    .matches(USERNAME_REGEX)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, underscores, or hyphens'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('role')
    .isIn(['admin', 'manager', 'cashier'])
    .withMessage('Invalid role'),
  body('location_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid location ID'),
];

router.post('/register',
  strictLimiter,
  authenticateToken,
  authorizeRoles('admin'),
  registerValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array() 
      });
    }

    const { username, email, password, role, location_id } = req.body;

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        code: 'WEAK_PASSWORD',
        details: passwordCheck.errors
      });
    }

    try {
      const userCheck = await query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (userCheck.rows.length > 0) {
        return res.status(409).json({ 
          error: 'User already exists',
          code: 'USER_EXISTS'
        });
      }

      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

      const result = await query(
        `INSERT INTO users (username, email, password_hash, role, location_id) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, role, location_id, created_at`,
        [username, email, password_hash, role, location_id || null]
      );

      const user = result.rows[0];

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, location_id || null, 'user_created', `Admin created user: ${username}`, JSON.stringify({ created_user_id: user.id, role })]
      );

      const token = generateToken(user);

      res.status(201).json({ 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          location_id: user.location_id,
          created_at: user.created_at
        }, 
        token 
      });
    } catch (err) {
      console.error('Registration error:', err);
      
      if (['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND'].includes(err.code)) {
        return res.status(503).json({
          error: 'Database service unavailable',
          code: 'DB_UNAVAILABLE',
        });
      }
      
      if (err.code === '23505') {
        return res.status(409).json({
          error: 'User already exists',
          code: 'USER_EXISTS'
        });
      }
      
      res.status(500).json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);

const loginValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required'),
  body('password')
    .exists()
    .withMessage('Password is required'),
];

router.post('/login',
  authLimiter,
  loginValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array() 
      });
    }

    const { username, password } = req.body;

    try {
      const result = await query(
        'SELECT * FROM users WHERE (username = $1 OR email = $1) AND is_active = true',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ 
          error: 'Invalid credentials',
          code: 'AUTH_INVALID_CREDENTIALS'
        });
      }

      const user = result.rows[0];

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ 
          error: 'Invalid credentials',
          code: 'AUTH_INVALID_CREDENTIALS'
        });
      }

      const token = generateToken(user);

      const { password_hash, ...userWithoutPassword } = user;

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, user.location_id, 'user_login', `User logged in: ${username}`, JSON.stringify({ login_method: 'password' })]
      );

      await query(
        `UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [user.id]
      );

      res.json({ user: userWithoutPassword, token });
    } catch (err) {
      console.error('Login error:', err);
      
      if (['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND'].includes(err.code)) {
        return res.status(503).json({
          error: 'Database service unavailable',
          code: 'DB_UNAVAILABLE',
        });
      }
      
      res.status(500).json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, role, location_id, full_name, phone_number, created_at, updated_at
       FROM users WHERE id = $1 AND is_active = true`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get user error:', err);
    
    if (['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND'].includes(err.code)) {
      return res.status(503).json({
        error: 'Database service unavailable',
        code: 'DB_UNAVAILABLE',
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await query(
      `INSERT INTO activity_log (user_id, location_id, activity_type, description)
       VALUES ($1, $2, 'user_logout', $3)`,
      [req.user.id, req.user.location_id, `User logged out: ${req.user.username}`]
    );
    
    res.json({ 
      message: 'Logged out successfully',
      code: 'LOGOUT_SUCCESS'
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.json({ 
      message: 'Logged out successfully',
      code: 'LOGOUT_SUCCESS'
    });
  }
});

const changePasswordValidation = [
  body('current_password')
    .exists()
    .withMessage('Current password is required'),
  body('new_password')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters'),
];

router.post('/change-password',
  authLimiter,
  authenticateToken,
  changePasswordValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array() 
      });
    }

    const { current_password, new_password } = req.body;

    const passwordCheck = validatePassword(new_password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        error: 'New password does not meet security requirements',
        code: 'WEAK_PASSWORD',
        details: passwordCheck.errors
      });
    }

    try {
      const result = await query(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      const isValid = await bcrypt.compare(current_password, result.rows[0].password_hash);
      if (!isValid) {
        return res.status(401).json({ 
          error: 'Current password is incorrect',
          code: 'AUTH_INVALID_CURRENT_PASSWORD'
        });
      }

      const samePassword = await bcrypt.compare(new_password, result.rows[0].password_hash);
      if (samePassword) {
        return res.status(400).json({
          error: 'New password must be different from current password',
          code: 'PASSWORD_SAME_AS_OLD'
        });
      }

      const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);

      await query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [password_hash, req.user.id]
      );

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description)
         VALUES ($1, $2, 'password_changed', $3)`,
        [req.user.id, req.user.location_id, `Password changed for user: ${req.user.username}`]
      );

      res.json({ 
        message: 'Password changed successfully',
        code: 'PASSWORD_CHANGED'
      });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);


const changeCredentialsValidation = [
  body('current_password')
    .exists()
    .withMessage('Current password is required'),
  body('new_username')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 3 })
    .withMessage('Username must be at least 3 characters'),
  body('new_password')
    .optional({ values: 'falsy' })
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters'),
];

router.post('/change-credentials',
  authLimiter,
  authenticateToken,
  changeCredentialsValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }

    const { current_password, new_username, new_password } = req.body;
    const hasUsernameUpdate = typeof new_username === 'string' && new_username.trim().length > 0;
    const hasPasswordUpdate = typeof new_password === 'string' && new_password.length > 0;

    if (!hasUsernameUpdate && !hasPasswordUpdate) {
      return res.status(400).json({
        error: 'Provide at least a new username or new password',
        code: 'NO_CHANGES_PROVIDED'
      });
    }

    if (hasPasswordUpdate) {
      const passwordCheck = validatePassword(new_password);
      if (!passwordCheck.valid) {
        return res.status(400).json({
          error: 'New password does not meet security requirements',
          code: 'WEAK_PASSWORD',
          details: passwordCheck.errors
        });
      }
    }

    try {
      const userResult = await query(
        'SELECT id, username, email, role, location_id, password_hash FROM users WHERE id = $1 AND is_active = true',
        [req.user.id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      const existingUser = userResult.rows[0];
      const isValid = await bcrypt.compare(current_password, existingUser.password_hash);
      if (!isValid) {
        return res.status(401).json({
          error: 'Current password is incorrect',
          code: 'AUTH_INVALID_CURRENT_PASSWORD'
        });
      }

      let resolvedUsername = existingUser.username;
      if (hasUsernameUpdate) {
        const normalizedUsername = new_username.trim();
        if (normalizedUsername !== existingUser.username) {
          const duplicate = await query(
            'SELECT id FROM users WHERE username = $1 AND id <> $2 AND is_active = true LIMIT 1',
            [normalizedUsername, req.user.id]
          );
          if (duplicate.rows.length > 0) {
            return res.status(409).json({
              error: 'Username already exists',
              code: 'USERNAME_EXISTS'
            });
          }
          resolvedUsername = normalizedUsername;
        }
      }

      let passwordHash = existingUser.password_hash;
      if (hasPasswordUpdate) {
        const samePassword = await bcrypt.compare(new_password, existingUser.password_hash);
        if (samePassword) {
          return res.status(400).json({
            error: 'New password must be different from current password',
            code: 'PASSWORD_SAME_AS_OLD'
          });
        }
        passwordHash = await bcrypt.hash(new_password, SALT_ROUNDS);
      }

      const updatedResult = await query(
        `UPDATE users
         SET username = $1,
             password_hash = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, username, email, role, location_id, full_name, phone_number, created_at, updated_at`,
        [resolvedUsername, passwordHash, req.user.id]
      );

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description)
         VALUES ($1, $2, 'credentials_changed', $3)`,
        [
          req.user.id,
          req.user.location_id,
          `Credentials changed for user: ${existingUser.username}`,
        ]
      );

      const token = generateToken(updatedResult.rows[0]);
      res.json({
        message: 'Credentials updated successfully',
        code: 'CREDENTIALS_UPDATED',
        user: updatedResult.rows[0],
        token,
      });
    } catch (err) {
      console.error('Change credentials error:', err);
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);


const recoverAdminValidation = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('recovery_key').trim().notEmpty().withMessage('Recovery key is required'),
  body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

router.post('/recover-admin-account',
  strictLimiter,
  recoverAdminValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }

    const { username, recovery_key, new_password } = req.body;
    const configuredRecoveryKey = process.env.ADMIN_RECOVERY_KEY;

    if (!configuredRecoveryKey) {
      return res.status(503).json({
        error: 'Admin recovery is not configured on this server',
        code: 'RECOVERY_NOT_CONFIGURED'
      });
    }

    if (recovery_key !== configuredRecoveryKey) {
      return res.status(401).json({
        error: 'Invalid recovery key',
        code: 'INVALID_RECOVERY_KEY'
      });
    }

    const passwordCheck = validatePassword(new_password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        error: 'New password does not meet security requirements',
        code: 'WEAK_PASSWORD',
        details: passwordCheck.errors
      });
    }

    try {
      const userResult = await query(
        `SELECT id, username, password_hash, role, location_id
         FROM users
         WHERE username = $1 AND role = 'admin'
         LIMIT 1`,
        [username]
      );

      if (!userResult.rows.length) {
        return res.status(404).json({
          error: 'Admin account not found',
          code: 'ADMIN_NOT_FOUND'
        });
      }

      const adminUser = userResult.rows[0];
      const samePassword = await bcrypt.compare(new_password, adminUser.password_hash);
      if (samePassword) {
        return res.status(400).json({
          error: 'New password must be different from current password',
          code: 'PASSWORD_SAME_AS_OLD'
        });
      }

      const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);

      await query(
        `UPDATE users
         SET password_hash = $1,
             is_active = true,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [password_hash, adminUser.id]
      );

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description)
         VALUES ($1, $2, 'admin_password_recovery', $3)`,
        [adminUser.id, adminUser.location_id, `Admin password recovered for user: ${adminUser.username}`]
      );

      res.json({
        message: 'Admin password reset successful. Please login with your new password.',
        code: 'ADMIN_PASSWORD_RESET_SUCCESS'
      });
    } catch (err) {
      console.error('Recover admin account error:', err);
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);

router.post('/refresh-token', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, email, role, location_id FROM users WHERE id = $1 AND is_active = true',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = result.rows[0];
    const token = generateToken(user);

    res.json({ 
      user, 
      token,
      code: 'TOKEN_REFRESHED'
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;
