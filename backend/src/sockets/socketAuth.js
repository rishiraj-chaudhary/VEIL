import User from '../models/user.js';
import { verifyToken } from '../utils/jwt.js';

/**
 * Socket.io handshake authentication.
 *
 * The HTTP API is authenticated on every route, but the websocket layer was not:
 * the default namespace and `/assistant` accepted any connection and trusted
 * whatever `userId` arrived in the message payload. That let an anonymous client
 * join `debate-<id>` for a private practice debate and receive every turn, and —
 * more expensively — call `analyze-draft`, which runs several model calls per
 * message with no rate limit, no budget check and nobody to bill.
 *
 * The client already sends its token in `handshake.auth.token`; this is what
 * makes `socket.userId` mean something.
 */
export const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token
      || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    const decoded = verifyToken(token);
    if (!decoded?.id) return next(new Error('Authentication required'));

    const user = await User.findById(decoded.id).select('username isActive').lean();
    if (!user || !user.isActive) return next(new Error('Authentication required'));

    socket.userId = user._id.toString();
    socket.username = user.username;
    return next();
  } catch {
    return next(new Error('Authentication failed'));
  }
};

/**
 * Per-socket sliding-window limiter for expensive events.
 *
 * Returns true when the call is allowed. Socket events bypass the Express rate
 * limiters entirely, so an authenticated client could still hold an open
 * connection and emit `analyze-draft` in a loop.
 */
export const socketRateLimiter = ({ max = 10, windowMs = 60_000 } = {}) => {
  const windows = new WeakMap();

  return (socket) => {
    const now = Date.now();
    const entry = windows.get(socket);

    if (!entry || now >= entry.resetAt) {
      windows.set(socket, { count: 1, resetAt: now + windowMs });
      return true;
    }

    entry.count += 1;
    return entry.count <= max;
  };
};

export default authenticateSocket;
