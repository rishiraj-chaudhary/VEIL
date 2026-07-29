/**
 * Error carrying an HTTP status, thrown by services and controllers and
 * translated into a response by the central error handler.
 *
 * `isOperational` separates expected failures (bad input, missing resource,
 * forbidden) from genuine bugs — only the former are safe to show a client.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, { code, details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    if (code) this.code = code;
    if (details) this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const badRequest   = (message = 'Invalid request', options)      => new AppError(message, 400, options);
export const unauthorized = (message = 'Authentication required', options) => new AppError(message, 401, options);
export const forbidden    = (message = 'Not authorized', options)       => new AppError(message, 403, options);
export const notFound     = (message = 'Resource not found', options)   => new AppError(message, 404, options);
export const conflict     = (message = 'Resource already exists', options) => new AppError(message, 409, options);

export default AppError;
