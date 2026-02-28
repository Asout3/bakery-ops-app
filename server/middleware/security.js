import rateLimit from 'express-rate-limit';
import { ipKeyGenerator } from 'express-rate-limit';

const isDevelopment = process.env.NODE_ENV !== 'production';

const authLimiter = rateLimit({
  windowMs: isDevelopment ? 60 * 1000 : 15 * 60 * 1000,
  max: isDevelopment ? 100 : 10,
  message: {
    error: 'Too many authentication attempts',
    code: 'RATE_LIMIT_AUTH',
    retryAfter: isDevelopment ? '1 minute' : '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: !isDevelopment,
  keyGenerator: ipKeyGenerator
});

const apiLimiter = rateLimit({
  windowMs: isDevelopment ? 30 * 1000 : 15 * 60 * 1000,
  max: isDevelopment ? 1000 : 100,
  message: {
    error: 'Too many requests from this IP',
    code: 'RATE_LIMIT_API',
    retryAfter: isDevelopment ? '30 seconds' : '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator
});

const strictLimiter = rateLimit({
  windowMs: isDevelopment ? 60 * 1000 : 60 * 60 * 1000,
  max: isDevelopment ? 50 : 5,
  message: {
    error: 'Too many attempts. Please try again later.',
    code: 'RATE_LIMIT_STRICT',
    retryAfter: isDevelopment ? '1 minute' : '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator
});

const passwordResetLimiter = rateLimit({
  windowMs: isDevelopment ? 60 * 1000 : 60 * 60 * 1000,
  max: isDevelopment ? 20 : 3,
  message: {
    error: 'Too many password reset attempts',
    code: 'RATE_LIMIT_PASSWORD_RESET',
    retryAfter: isDevelopment ? '1 minute' : '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator
});

export { authLimiter, apiLimiter, strictLimiter, passwordResetLimiter };

export function validatePassword(password) {
  const errors = [];
  
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Za-z]/.test(password)) {
    errors.push('Password must contain at least one letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>]/g, '')
    .trim();
}

export function validateEnvironment() {
  const required = ['JWT_SECRET', 'DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('[FATAL] JWT_SECRET must be at least 32 characters long');
    process.exit(1);
  }
  
  if (process.env.NODE_ENV === 'production') {
    const warnings = [];
    
    if (process.env.JWT_SECRET === 'your_super_secret_jwt_key_change-this-in-production-min-32-chars' || 
        process.env.JWT_SECRET?.includes('dev') ||
        process.env.JWT_SECRET?.includes('test')) {
      warnings.push('JWT_SECRET appears to be a development/test value');
    }
    
    if (!process.env.ALLOWED_ORIGINS) {
      warnings.push('ALLOWED_ORIGINS not set - CORS will be restrictive');
    }
    
    if (warnings.length > 0) {
      console.warn('[WARN] Production environment warnings:');
      warnings.forEach(w => console.warn(`  - ${w}`));
    }
  }
  
  console.log('[INFO] Environment validation passed');
}

export function getCorsOptions() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];
  
  if (process.env.NODE_ENV !== 'production') {
    return {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Location-Id', 'X-Idempotency-Key', 'X-Retry-Count', 'X-Queued-Request', 'Accept', 'Accept-Language'],
    };
  }
  
  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Location-Id', 'X-Idempotency-Key', 'X-Retry-Count', 'X-Queued-Request', 'X-Queued-Created-At', 'X-Offline-Actor-Id', 'X-Skip-Auth-Redirect'],
    maxAge: 86400,
  };
}
