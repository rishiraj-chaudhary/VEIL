import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * pipeline. Without it, an async handler that throws produces a hung request
 * rather than a response — which is why every controller needed its own
 * try/catch purely to avoid that.
 */
export const asyncHandler = handler => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
};

/**
 * Translates known error shapes into clean HTTP responses.
 *
 * Anything unrecognised is reported as a generic 500: driver and validation
 * errors carry connection strings, query fragments and internal paths, so they
 * must never be echoed to a client.
 */
const translate = (err) => {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, message: err.message, details: err.details };
  }

  // Mongoose: schema validation
  if (err.name === 'ValidationError' && err.errors) {
    return {
      statusCode: 400,
      message: 'Validation failed',
      details: Object.values(err.errors).map(e => ({ field: e.path, message: e.message })),
    };
  }

  // Mongoose: malformed ObjectId or similar
  if (err.name === 'CastError') {
    return { statusCode: 400, message: `Invalid value for '${err.path}'` };
  }

  // MongoDB: unique index violation
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    return {
      statusCode: 409,
      message: field ? `That ${field} is already taken` : 'Resource already exists',
    };
  }

  if (err.name === 'JsonWebTokenError') {
    return { statusCode: 401, message: 'Invalid token. Please log in again.' };
  }

  if (err.name === 'TokenExpiredError') {
    return { statusCode: 401, message: 'Session expired. Please log in again.' };
  }

  // Body parser rejecting oversized or malformed JSON
  if (err.type === 'entity.too.large') {
    return { statusCode: 413, message: 'Request body too large' };
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return { statusCode: 400, message: 'Malformed JSON in request body' };
  }

  return { statusCode: err.statusCode || err.status || 500, message: null };
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const { statusCode, message, details } = translate(err);
  const isServerError = statusCode >= 500;

  const log = req.log ?? logger;

  if (isServerError) {
    log.error('unhandled error', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: statusCode,
      error: err.message,
      stack: err.stack,
    });
  } else {
    log.warn('request rejected', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: statusCode,
      reason: message || err.message,
    });
  }

  const body = {
    success: false,
    message: message || (isServerError ? 'Internal server error' : err.message),
  };

  if (details) body.errors = details;

  // Stack traces are a local development aid. They are opt-in rather than
  // opt-out because error messages routinely embed connection strings and
  // credentials, and "not production" covers staging and test environments that
  // are still reachable by people who should not see them.
  if (isServerError && process.env.NODE_ENV === 'development') {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};

export default errorHandler;
