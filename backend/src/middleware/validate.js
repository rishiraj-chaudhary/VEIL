import { validationResult } from 'express-validator';
import { badRequest } from '../utils/AppError.js';

/**
 * Runs a set of express-validator chains and rejects the request if any fail.
 *
 * Validation belongs in front of the controller so handlers can assume their
 * input is well-formed, instead of each one re-checking the same fields and
 * inventing its own error shape.
 */
export const validate = (chains = []) => [
  ...chains,
  (req, res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();

    const details = result.array().map(e => ({
      field: e.path ?? e.param,
      message: e.msg,
    }));

    next(badRequest('Validation failed', { details }));
  },
];

export default validate;
