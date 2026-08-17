/**
 * Single source of truth for browser origins allowed to reach this API.
 * Consumed by both the Express `cors` middleware and the Socket.io handshake —
 * these drifted apart previously, which silently broke websockets in production.
 */

// The deployed frontends are listed here rather than only in FRONTEND_URL so an
// environment that forgets the variable still works. New deployments should be
// added through FRONTEND_URL instead of extending this list.
const STATIC_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://veil-lvmb.vercel.app',
  'https://veil-lvmb-j1is6mtq4-rishis-projects-93e34b4b.vercel.app',
];

const envOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export const allowedOrigins = [...new Set([...STATIC_ALLOWED_ORIGINS, ...envOrigins])];

/**
 * Requests carrying no Origin header are allowed through.
 *
 * `origin` is absent on same-origin requests, server-to-server calls, curl,
 * mobile clients and health checks. Passing the bare array to the cors package
 * rejects all of those, which is why the smoke-test script and any non-browser
 * consumer failed against a deployed instance while the app worked fine in a
 * browser. This is not a weakening: the header is set by the browser precisely
 * so that cross-origin *browser* traffic can be filtered, and the same-origin
 * policy is what makes it meaningful. Anything without one was never subject to
 * it in the first place.
 */
export const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} is not permitted by CORS`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};

export default corsOptions;
