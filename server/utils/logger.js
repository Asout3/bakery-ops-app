const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;
const isProduction = process.env.NODE_ENV === 'production';

const formatTimestamp = () => new Date().toISOString();

const formatMessage = (level, message, meta = {}) => {
  const logEntry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  };
  
  return isProduction ? JSON.stringify(logEntry) : logEntry;
};

export const logger = {
  error: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.error) {
      const formatted = formatMessage('error', message, meta);
      if (isProduction) {
        console.error(formatted);
      } else {
        console.error('[ERROR]', message, meta);
      }
    }
  },

  warn: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.warn) {
      const formatted = formatMessage('warn', message, meta);
      if (isProduction) {
        console.warn(formatted);
      } else {
        console.warn('[WARN]', message, meta);
      }
    }
  },

  info: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.info) {
      const formatted = formatMessage('info', message, meta);
      if (isProduction) {
        console.log(formatted);
      } else {
        console.log('[INFO]', message, meta);
      }
    }
  },

  debug: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.debug) {
      const formatted = formatMessage('debug', message, meta);
      if (isProduction) {
        console.log(formatted);
      } else {
        console.log('[DEBUG]', message, meta);
      }
    }
  },

  request: (req, res, next) => {
    if (!isProduction) {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(
          `[${formatTimestamp()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
        );
      });
    }
    next();
  },
};

export default logger;
