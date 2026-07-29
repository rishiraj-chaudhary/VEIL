/**
 * ENDPOINT SMOKE TEST
 *
 * Boots the real server and exercises every major route, asserting status codes
 * rather than payloads. Complements the unit tests: those prove logic in
 * isolation, this proves the wiring — routes, validators, auth and the error
 * handler actually compose the way they are supposed to.
 *
 * Written after a controller refactor passed `node --check` on every file while
 * having silently deleted an exported handler. Syntax validity is not evidence
 * that an endpoint still answers.
 *
 * Run: node scripts/endpointSmoke.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();
process.env.PORT = process.env.SMOKE_PORT || '5098';

await import('../server.js');
await new Promise(r => setTimeout(r, 12000)); // let RAG + schedulers settle

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const User = (await import('../src/models/user.js')).default;
const { generateToken } = await import('../src/utils/jwt.js');

const user = await User.findOne({ isActive: true, isSystem: { $ne: true } });
if (!user) {
  console.error('No non-system user in the database to authenticate as.');
  process.exit(1);
}
const auth = { Authorization: `Bearer ${generateToken(user._id)}` };

const checks = [
  ['GET  /health',                     '/health', null, 200],
  ['GET  /api/posts',                  '/api/posts', null, 200],
  ['GET  /api/posts?sort=bogus',       '/api/posts?sort=bogus', null, 400],
  ['GET  /api/posts/:badId',           '/api/posts/not-an-id', null, 400],
  ['GET  /api/communities',            '/api/communities', null, 200],
  ['GET  /api/communities/:unknown',   '/api/communities/definitely-not-real', null, 404],
  ['GET  /api/debates',                '/api/debates', null, 200],
  ['GET  /api/debates/ai/profiles',    '/api/debates/ai/profiles', null, 200],
  ['GET  /api/reputation/me',          '/api/reputation/me', auth, 200],
  ['GET  /api/reputation/me (no auth)','/api/reputation/me', null, 401],
  ['GET  /api/reputation/leaderboard', '/api/reputation/leaderboard', null, 200],
  ['GET  /api/coach/summary',          '/api/coach/summary', auth, 200],
  ['GET  /api/coach/leaderboard/all',  '/api/coach/leaderboard/all', null, 200],
  // Removed as duplicates of /reputation/leaderboard — asserted gone so they
  // cannot quietly return.
  ['GET  /api/coach/leaderboard',      '/api/coach/leaderboard', null, 404],
  ['GET  /api/debates/:id/reactions',  '/api/debates/000000000000000000000000/reactions', null, 404],
  ['GET  /api/ai/status',              '/api/ai/status', auth, 200],
  ['GET  /api/karma/leaderboard',      '/api/karma/leaderboard', null, 200],
  ['GET  /api/karma/me',               '/api/karma/me', auth, 200],
  ['GET  /api/knowledge-graph/stats',  '/api/knowledge-graph/stats', null, 200],
  ['GET  /api/persona/snapshots',      '/api/persona/snapshots', auth, 200],
  ['GET  /api/huddles/my',             '/api/huddles/my', auth, 200],
  ['GET  /api/slicks/received',        '/api/slicks/received', auth, 200],
  ['GET  /api/ai-usage/my-stats',      '/api/ai-usage/my-stats', auth, 200],
  ['GET  /api/feed',                   '/api/feed', auth, 200],
  ['GET  /api/nonexistent',            '/api/nonexistent-route', null, 404],

  // The sparring agent is POST-only and costs model calls, so it is checked at
  // the guards rather than by running a session: auth must reject anonymously,
  // and validation must reject a malformed body before any spend happens.
  ['POST /api/sparring (no auth)',     '/api/sparring', null, 401,
    { method: 'POST', body: { topic: 'x', side: 'for', draft: 'y' } }],
  ['POST /api/sparring (bad body)',    '/api/sparring', auth, 400,
    { method: 'POST', body: { topic: 'ok topic', side: 'sideways', draft: 'too short' } }],
];

const failures = [];
let pass = 0;

for (const [label, path, headers, expected, options] of checks) {
  try {
    const res = await fetch(BASE + path, {
      method: options?.method ?? 'GET',
      headers: {
        ...(headers || {}),
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const ok = res.status === expected;
    ok ? pass++ : failures.push(`${label} → ${res.status}, expected ${expected}`);
    console.log(`${ok ? '✅' : '❌'} ${label.padEnd(34)} ${res.status}`);
  } catch (err) {
    failures.push(`${label} → threw ${err.message}`);
    console.log(`❌ ${label.padEnd(34)} THREW`);
  }
}

console.log(`\n${pass}/${checks.length} endpoints behaving as expected`);
failures.forEach(f => console.log(`  ✗ ${f}`));

await mongoose.disconnect();
process.exit(failures.length ? 1 : 0);
