import User from '../models/user.js';
import { verifyToken } from '../utils/jwt.js';
import { unauthorized } from '../utils/AppError.js';

/**
 * Resolves the bearer token on a request to a live, active user.
 *
 * Returns null for every "not authenticated" case rather than distinguishing
 * them: telling a caller whether a token was malformed, expired, or belonged to
 * a disabled account is free reconnaissance.
 */
const resolveUser = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded?.id) return null;

  // `password` is already select:false on the schema, so it is not loaded here.
  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) return null;

  return user;
};

export const authenticate = async (req, res, next) => {
  try {
    const user = await resolveUser(req);

    if (!user) {
      return next(unauthorized('Invalid or expired session. Please log in again.'));
    }

    req.user = user;
    next();
  } catch (error) {
    // Previously this answered 500 itself with its own body shape. A database
    // blip during a lookup is a server error like any other and belongs in the
    // central handler, which logs it with the request id and returns the same
    // envelope as every other failure.
    next(error);
  }
};

/**
 * Attaches req.user when the request carries a valid token, and continues
 * without it otherwise.
 *
 * For endpoints that are public but behave differently for a signed-in caller —
 * the debate listing, for instance, which supports `?myDebates=true`. Handlers
 * using this must treat `req.user` as optional; it is not an authorisation
 * check.
 */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (user) req.user = user;
  } catch {
    // A lookup failure here means "not signed in", not "request failed" — the
    // route works fine without a user.
  }
  next();
};

export default authenticate;
