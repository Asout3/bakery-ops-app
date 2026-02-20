import crypto from 'crypto';

export function attachRequestContext(req, res, next) {
  const incomingRequestId = req.headers['x-request-id'];
  const requestId = incomingRequestId || `req-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
