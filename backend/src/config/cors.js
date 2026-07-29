/**
 * Single source of truth for browser origins allowed to reach this API.
 * Consumed by both the Express `cors` middleware and the Socket.io handshake —
 * these drifted apart previously, which silently broke websockets in production.
 */

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

export const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};

export default corsOptions;
