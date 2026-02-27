export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTH_REQUIRED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 503, 'DB_ERROR');
  }
}

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || req.headers['x-request-id'] || `req-${Date.now()}`;
  const isProduction = process.env.NODE_ENV === 'production';

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      requestId,
      ...(err.details ? { details: err.details } : {}),
      ...(!isProduction ? { stack: err.stack } : {}),
    });
  }

  if (err.name === 'UnauthorizedError' || err.code === 'invalid_token') {
    return res.status(401).json({
      error: 'Invalid or expired token',
      code: 'AUTH_INVALID_TOKEN',
      requestId,
    });
  }

  if (err.name === 'SyntaxError' && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON payload',
      code: 'INVALID_JSON',
      requestId,
    });
  }

  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Resource already exists',
      code: 'DUPLICATE_ENTRY',
      requestId,
    });
  }


  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'Origin not allowed',
      code: 'CORS_DENIED',
      requestId,
    });
  }
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Referenced resource not found',
      code: 'FOREIGN_KEY_VIOLATION',
      requestId,
    });
  }


  if (Number.isInteger(err.status) && typeof err.code === 'string' && typeof err.message === 'string') {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      requestId,
      ...(!isProduction ? { stack: err.stack } : {}),
    });
  }

  console.error(`[${requestId}] Unhandled error:`, {
    message: err.message,
    stack: isProduction ? undefined : err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: isProduction ? 'Internal server error' : err.message,
    code: 'INTERNAL_ERROR',
    requestId,
    ...(!isProduction ? { stack: err.stack } : {}),
  });
};

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  asyncHandler,
  errorHandler,
};
