import crypto from 'crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles, generateToken } from '../middleware/auth.js';
import { authLimiter, strictLimiter, validatePassword } from '../middleware/security.js';
import { AppError, asyncHandler } from '../utils/errors.js';

const router = express.Router();

const SALT_ROUNDS = 12;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
const MAX_LOGIN_ATTEMPTS = Number(process.env.AUTH_MAX_LOGIN_ATTEMPTS || 5);
const LOGIN_LOCK_MINUTES = Number(process.env.AUTH_LOCK_MINUTES || 15);
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.AUTH_REFRESH_TOKEN_TTL_DAYS || 14);

function validateRequest(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
  }
}

function toUserResponse(user) {
  const safeUser = { ...user };
  delete safeUser.password_hash;
  delete safeUser.failed_login_attempts;
  delete safeUser.locked_until;
  delete safeUser.last_failed_login_at;
  return safeUser;
}

function hashRefreshToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateRefreshTokenValue() {
  return crypto.randomBytes(48).toString('hex');
}

async function issueRefreshToken(tx, userId, replacedTokenId = null) {
  const plainToken = generateRefreshTokenValue();
  const tokenHash = hashRefreshToken(plainToken);
  const insertResult = await tx.query(
    `INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP + ($3::text || ' days')::interval)
     RETURNING id, expires_at`,
    [userId, tokenHash, REFRESH_TOKEN_TTL_DAYS]
  );

  if (replacedTokenId) {
    await tx.query(
      `UPDATE auth_refresh_tokens
       SET revoked_at = CURRENT_TIMESTAMP,
           replaced_by_id = $1
       WHERE id = $2 AND revoked_at IS NULL`,
      [insertResult.rows[0].id, replacedTokenId]
    );
  }

  return {
    refreshToken: plainToken,
    refreshTokenExpiresAt: insertResult.rows[0].expires_at,
  };
}

async function resetLoginFailures(userId) {
  await query(
    `UPDATE users
     SET failed_login_attempts = 0,
         locked_until = NULL,
         last_failed_login_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId]
  );
}

async function recordFailedLogin(userId) {
  const result = await query(
    `UPDATE users
     SET failed_login_attempts = CASE
           WHEN failed_login_attempts + 1 >= $2 THEN 0
           ELSE failed_login_attempts + 1
         END,
         locked_until = CASE
           WHEN failed_login_attempts + 1 >= $2 THEN CURRENT_TIMESTAMP + ($3::text || ' minutes')::interval
           ELSE locked_until
         END,
         last_failed_login_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING locked_until,
               GREATEST(0, $2 - (failed_login_attempts + 1)) AS attempts_left`,
    [userId, MAX_LOGIN_ATTEMPTS, LOGIN_LOCK_MINUTES]
  );

  return result.rows[0] || null;
}

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
  asyncHandler(async (req, res) => {
    validateRequest(req);

    const { username, email, password, role, location_id } = req.body;
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      throw new AppError('Password does not meet security requirements', 400, 'WEAK_PASSWORD', passwordCheck.errors);
    }

    const userCheck = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (userCheck.rows.length > 0) {
      throw new AppError('User already exists', 409, 'USER_EXISTS');
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await query(
      `INSERT INTO users (username, email, password_hash, role, location_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, role, location_id, created_at`,
      [username, email, password_hash, role, location_id || null]
    );

    const user = result.rows[0];

    await query(
      `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, location_id || null, 'user_created', `Admin created user: ${username}`, JSON.stringify({ created_user_id: user.id, role })]
    );

    const token = generateToken(user);

    res.status(201).json({ user, token });
  })
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
  asyncHandler(async (req, res) => {
    validateRequest(req);

    const { username, password } = req.body;

    const result = await query(
      `SELECT *
       FROM users
       WHERE (username = $1 OR email = $1) AND is_active = true`,
      [username]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invalid credentials', 401, 'AUTH_INVALID_CREDENTIALS');
    }

    const user = result.rows[0];

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      throw new AppError('Account temporarily locked due to repeated failed login attempts', 423, 'AUTH_ACCOUNT_LOCKED', {
        locked_until: user.locked_until,
      });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      const lockState = await recordFailedLogin(user.id);
      throw new AppError('Invalid credentials', 401, 'AUTH_INVALID_CREDENTIALS', lockState ? {
        attempts_left: Number(lockState.attempts_left),
        locked_until: lockState.locked_until,
      } : undefined);
    }

    await resetLoginFailures(user.id);

    const tokens = await withTransaction(async (tx) => {
      const issuedRefresh = await issueRefreshToken(tx, user.id);
      return {
        token: generateToken(user),
        refresh_token: issuedRefresh.refreshToken,
        refresh_token_expires_at: issuedRefresh.refreshTokenExpiresAt,
      };
    });

    await query(
      `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, user.location_id, 'user_login', `User logged in: ${username}`, JSON.stringify({ login_method: 'password' })]
    );

    await query(
      `UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [user.id]
    );

    res.json({ user: toUserResponse(user), ...tokens });
  })
);

router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, username, email, role, location_id, full_name, phone_number, created_at, updated_at
     FROM users WHERE id = $1 AND is_active = true`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json(result.rows[0]);
}));

router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : null;

  await query(
    `INSERT INTO activity_log (user_id, location_id, activity_type, description)
     VALUES ($1, $2, 'user_logout', $3)`,
    [req.user.id, req.user.location_id, `User logged out: ${req.user.username}`]
  );

  if (refreshToken) {
    await query(
      `UPDATE auth_refresh_tokens
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL`,
      [req.user.id, hashRefreshToken(refreshToken)]
    );
  }

  res.json({ message: 'Logged out successfully', code: 'LOGOUT_SUCCESS' });
}));

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
  asyncHandler(async (req, res) => {
    validateRequest(req);

    const { current_password, new_password } = req.body;

    const passwordCheck = validatePassword(new_password);
    if (!passwordCheck.valid) {
      throw new AppError('New password does not meet security requirements', 400, 'WEAK_PASSWORD', passwordCheck.errors);
    }

    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const isValid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!isValid) {
      throw new AppError('Current password is incorrect', 401, 'AUTH_INVALID_CURRENT_PASSWORD');
    }

    const samePassword = await bcrypt.compare(new_password, result.rows[0].password_hash);
    if (samePassword) {
      throw new AppError('New password must be different from current password', 400, 'PASSWORD_SAME_AS_OLD');
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

    res.json({ message: 'Password changed successfully', code: 'PASSWORD_CHANGED' });
  })
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
  asyncHandler(async (req, res) => {
    validateRequest(req);

    const { current_password, new_username, new_password } = req.body;
    const hasUsernameUpdate = typeof new_username === 'string' && new_username.trim().length > 0;
    const hasPasswordUpdate = typeof new_password === 'string' && new_password.length > 0;

    if (!hasUsernameUpdate && !hasPasswordUpdate) {
      throw new AppError('Provide at least a new username or new password', 400, 'NO_CHANGES_PROVIDED');
    }

    if (hasPasswordUpdate) {
      const passwordCheck = validatePassword(new_password);
      if (!passwordCheck.valid) {
        throw new AppError('New password does not meet security requirements', 400, 'WEAK_PASSWORD', passwordCheck.errors);
      }
    }

    const userResult = await query(
      'SELECT id, username, email, role, location_id, password_hash FROM users WHERE id = $1 AND is_active = true',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const existingUser = userResult.rows[0];
    const isValid = await bcrypt.compare(current_password, existingUser.password_hash);
    if (!isValid) {
      throw new AppError('Current password is incorrect', 401, 'AUTH_INVALID_CURRENT_PASSWORD');
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
          throw new AppError('Username already exists', 409, 'USERNAME_EXISTS');
        }
        resolvedUsername = normalizedUsername;
      }
    }

    let passwordHash = existingUser.password_hash;
    if (hasPasswordUpdate) {
      const samePassword = await bcrypt.compare(new_password, existingUser.password_hash);
      if (samePassword) {
        throw new AppError('New password must be different from current password', 400, 'PASSWORD_SAME_AS_OLD');
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
  })
);

const recoverAdminValidation = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('recovery_key').trim().notEmpty().withMessage('Recovery key is required'),
  body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

router.post('/recover-admin-account',
  strictLimiter,
  recoverAdminValidation,
  asyncHandler(async (req, res) => {
    validateRequest(req);

    const { username, recovery_key, new_password } = req.body;
    const configuredRecoveryKey = process.env.ADMIN_RECOVERY_KEY;

    if (!configuredRecoveryKey) {
      throw new AppError('Admin recovery is not configured on this server', 503, 'RECOVERY_NOT_CONFIGURED');
    }

    if (recovery_key !== configuredRecoveryKey) {
      throw new AppError('Invalid recovery key', 401, 'INVALID_RECOVERY_KEY');
    }

    const passwordCheck = validatePassword(new_password);
    if (!passwordCheck.valid) {
      throw new AppError('New password does not meet security requirements', 400, 'WEAK_PASSWORD', passwordCheck.errors);
    }

    const userResult = await query(
      `SELECT id, username, password_hash, role, location_id
       FROM users
       WHERE username = $1 AND role = 'admin'
       LIMIT 1`,
      [username]
    );

    if (!userResult.rows.length) {
      throw new AppError('Admin account not found', 404, 'ADMIN_NOT_FOUND');
    }

    const adminUser = userResult.rows[0];
    const samePassword = await bcrypt.compare(new_password, adminUser.password_hash);
    if (samePassword) {
      throw new AppError('New password must be different from current password', 400, 'PASSWORD_SAME_AS_OLD');
    }

    const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);

    await query(
      `UPDATE users
       SET password_hash = $1,
           is_active = true,
           failed_login_attempts = 0,
           locked_until = NULL,
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
      code: 'ADMIN_PASSWORD_RESET_SUCCESS',
    });
  })
);

router.post('/refresh-token/rotate',
  authLimiter,
  body('refresh_token').trim().notEmpty().withMessage('refresh_token is required'),
  asyncHandler(async (req, res) => {
    validateRequest(req);

    const refreshToken = req.body.refresh_token;
    const tokenHash = hashRefreshToken(refreshToken);

    const tokenResult = await query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
              u.id AS user_id_ref, u.username, u.email, u.role, u.location_id, u.full_name, u.phone_number, u.created_at, u.updated_at
       FROM auth_refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    if (!tokenResult.rows.length) {
      throw new AppError('Invalid refresh token', 401, 'AUTH_REFRESH_INVALID');
    }

    const record = tokenResult.rows[0];
    if (record.revoked_at) {
      throw new AppError('Refresh token revoked', 401, 'AUTH_REFRESH_REVOKED');
    }

    if (new Date(record.expires_at).getTime() <= Date.now()) {
      throw new AppError('Refresh token expired', 401, 'AUTH_REFRESH_EXPIRED');
    }

    const user = {
      id: record.user_id_ref,
      username: record.username,
      email: record.email,
      role: record.role,
      location_id: record.location_id,
      full_name: record.full_name,
      phone_number: record.phone_number,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };

    const tokens = await withTransaction(async (tx) => {
      const issuedRefresh = await issueRefreshToken(tx, user.id, record.id);
      return {
        token: generateToken(user),
        refresh_token: issuedRefresh.refreshToken,
        refresh_token_expires_at: issuedRefresh.refreshTokenExpiresAt,
      };
    });

    res.json({
      user,
      ...tokens,
      code: 'TOKEN_REFRESHED',
    });
  })
);

router.post('/refresh-token', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT id, username, email, role, location_id, full_name, phone_number, created_at, updated_at FROM users WHERE id = $1 AND is_active = true',
    [req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found or inactive', 401, 'USER_NOT_FOUND');
  }

  const user = result.rows[0];
  const token = generateToken(user);

  res.json({
    user,
    token,
    code: 'TOKEN_REFRESHED',
  });
}));

export default router;
