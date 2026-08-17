import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * Connects to MongoDB and reports failure to the caller.
 *
 * This used to call `process.exit(1)` itself on a failed connection, which made
 * the caller's try/catch in server.js unreachable — the process was gone before
 * the rejection could be handled. Deciding whether a failed connection is fatal
 * belongs to whoever started the process, not to the connection helper: a script
 * or a test may want to carry on and report, where the server does not.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not set — the application cannot start without a database.');
  }

  const conn = await mongoose.connect(uri, {
    // Fail a connection attempt in seconds rather than sitting on the driver's
    // 30s default, so a bad URI surfaces at boot instead of hanging startup.
    serverSelectionTimeoutMS: 10_000,
  });

  logger.info('mongodb connected', {
    host: conn.connection.host,
    database: conn.connection.name,
  });

  return conn;
};

// Connection events
mongoose.connection.on('error', (err) => {
  logger.error('mongoose connection error', { error: err.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('mongoose disconnected');
});

/**
 * Closes the connection. Called from the server's shutdown sequence.
 *
 * This module previously registered its own `process.on('SIGINT')` handler that
 * closed the connection and immediately called `process.exit(0)`. Node runs
 * signal handlers in registration order, and this one is registered at import
 * time — long before server.js installs its own — so on Ctrl-C it exited the
 * process first and the graceful shutdown never ran: in-flight requests were
 * cut, and the schedulers and job worker were never stopped. Shutdown is now
 * sequenced in one place.
 */
export const disconnectDB = async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close();
  logger.info('mongodb connection closed');
};

export default connectDB;
