import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set');
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET must be at least 32 characters for security');
  process.exit(1);
}

const TOKEN_EXPIRY = '24h';
const ISSUER = 'bakery-ops';

function getRequestId(req) {
  return req.requestId || req.headers['x-request-id'] || `req-${Date.now()}`;
}

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'AUTH_TOKEN_REQUIRED',
      requestId: getRequestId(req)
    });
  }

  jwt.verify(token, JWT_SECRET, {
    issuer: ISSUER,
    maxAge: '24h'
  }, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token has expired',
          code: 'AUTH_TOKEN_EXPIRED',
          expiredAt: err.expiredAt,
          requestId: getRequestId(req)
        });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Invalid token',
          code: 'AUTH_TOKEN_INVALID',
          requestId: getRequestId(req)
        });
      }
      if (err.name === 'NotBeforeError') {
        return res.status(401).json({
          error: 'Token not yet active',
          code: 'AUTH_TOKEN_NOT_ACTIVE',
          requestId: getRequestId(req)
        });
      }
      return res.status(403).json({ 
        error: 'Token verification failed',
        code: 'AUTH_TOKEN_VERIFICATION_FAILED',
        requestId: getRequestId(req)
      });
    }

    if (!user.id || !user.role) {
      return res.status(403).json({
        error: 'Invalid token payload',
        code: 'AUTH_TOKEN_INVALID_PAYLOAD',
        requestId: getRequestId(req)
      });
    }
    
    req.user = user;
    next();
  });
};

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        requestId: getRequestId(req)
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'AUTH_INSUFFICIENT_PERMISSIONS',
        required: roles,
        current: req.user.role,
        requestId: getRequestId(req)
      });
    }
    
    next();
  };
};

export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, {
    issuer: ISSUER,
    maxAge: '24h'
  }, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
};

export const requireOwnershipOrRole = (paramUserIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        requestId: getRequestId(req)
      });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    const targetUserId = parseInt(req.params[paramUserIdField] || req.body[paramUserIdField], 10);
    
    if (req.user.id !== targetUserId) {
      return res.status(403).json({
        error: 'You can only access your own resources',
        code: 'AUTH_RESOURCE_OWNERSHIP_REQUIRED',
        requestId: getRequestId(req)
      });
    }

    next();
  };
};

export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      location_id: user.location_id
    },
    JWT_SECRET,
    {
      expiresIn: TOKEN_EXPIRY,
      issuer: ISSUER,
      subject: String(user.id)
    }
  );
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: ISSUER
    });
  } catch (err) {
    return null;
  }
};

export const decodeToken = (token) => {
  try {
    return jwt.decode(token, { complete: true });
  } catch (err) {
    return null;
  }
};
