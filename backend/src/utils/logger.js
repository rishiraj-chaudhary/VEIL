import crypto from 'crypto';

/**
 * STRUCTURED LOGGING
 *
 * Emits JSON in production so lines are queryable by field, and stays
 * human-readable in development. Bare console.log leaves production logs
 * unsearchable — you cannot ask "every error for this user" or "every AI call
 * over 5 seconds" of a wall of interpolated strings.
 *
 * A request id threads through each request's logs so a single user's path
 * through the system can be reconstructed from interleaved output.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const configuredLevel = LEVELS[process.env.LOG_LEVEL] ?? (
  process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug
);

const isProduction = process.env.NODE_ENV === 'production';

// Never let a credential reach the log, whatever the caller passed.
const REDACTED_KEYS = /^(password|token|authorization|secret|apikey|api_key|jwt|cookie)$/i;

const redact = (value, depth = 0) => {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(v => redact(v, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = REDACTED_KEYS.test(key) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
};

const emit = (level, message, context = {}) => {
  if (LEVELS[level] < configuredLevel) return;

  const safeContext = redact(context);

  if (isProduction) {
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      message,
      ...safeContext,
    });
    (level === 'error' ? console.error : console.log)(line);
    return;
  }

  const detail = Object.keys(safeContext).length ? ` ${JSON.stringify(safeContext)}` : '';
  const prefix = { debug: '·', info: 'ℹ', warn: '⚠', error: '✖' }[level];
  const write = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  write(`${prefix} ${message}${detail}`);
};

export const logger = {
  debug: (message, context) => emit('debug', message, context),
  info:  (message, context) => emit('info', message, context),
  warn:  (message, context) => emit('warn', message, context),
  error: (message, context) => emit('error', message, context),

  /** Returns a logger that stamps the same fields onto every line. */
  child(bound = {}) {
    return {
      debug: (m, c) => emit('debug', m, { ...bound, ...c }),
      info:  (m, c) => emit('info', m, { ...bound, ...c }),
      warn:  (m, c) => emit('warn', m, { ...bound, ...c }),
      error: (m, c) => emit('error', m, { ...bound, ...c }),
      child: (more) => logger.child({ ...bound, ...more }),
    };
  },
};

/**
 * Attaches a request id and a bound logger to every request, and records how
 * long each one took. Without an id, concurrent requests interleave and no log
 * line can be traced back to the call that produced it.
 */
export const requestLogger = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const startedAt = Date.now();

  req.id = requestId;
  req.log = logger.child({ requestId });
  res.set('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    emit(level, 'request', {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: duration,
      userId: req.user?._id?.toString(),
    });
  });

  next();
};

export default logger;
