/**
 * Regression tests for authentication and route wiring.
 */

import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

import { authenticate, optionalAuthenticate } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import User from '../src/models/user.js';
import { generateToken } from '../src/utils/jwt.js';

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

const appWith = (middleware) => {
  const app = express();
  app.get('/probe', middleware, (req, res) =>
    res.json({ user: req.user ? req.user.username : null }));
  app.use(errorHandler);
  return app;
};

const makeUser = (overrides = {}) => User.create({
  username: 'probe_user',
  email: 'probe@test.local',
  password: 'password123',
  ...overrides,
});

describe('authenticate', () => {
  test('a valid token attaches the user', async () => {
    const user = await makeUser();

    const res = await request(appWith(authenticate))
      .get('/probe')
      .set('Authorization', `Bearer ${generateToken(user._id)}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBe('probe_user');
  });

  test('the password hash is never attached to the request', async () => {
    const user = await makeUser();
    const loaded = await User.findById(user._id);
    // `select: false` on the schema is what keeps the hash off req.user.
    expect(loaded.password).toBeUndefined();
  });

  test('a disabled account is rejected even with a valid token', async () => {
    const user = await makeUser({ isActive: false });

    const res = await request(appWith(authenticate))
      .get('/probe')
      .set('Authorization', `Bearer ${generateToken(user._id)}`);

    expect(res.status).toBe(401);
  });

  test.each([
    ['no header',        undefined],
    ['wrong scheme',     'Token abc'],
    ['empty bearer',     'Bearer '],
    ['garbage token',    'Bearer not-a-jwt'],
  ])('%s is rejected with 401, not 500', async (_label, header) => {
    const req = request(appWith(authenticate)).get('/probe');
    if (header) req.set('Authorization', header);

    const res = await req;
    expect(res.status).toBe(401);
  });

  /**
   * A token for a user that no longer exists used to reach `User.findById`,
   * return null, and answer 401 — correct. What was wrong was the shape of the
   * failures around it: the middleware caught its own errors and replied 500
   * with a hand-rolled body instead of delegating to the error handler.
   */
  test('a token for a deleted user is rejected', async () => {
    const res = await request(appWith(authenticate))
      .get('/probe')
      .set('Authorization', `Bearer ${generateToken(new mongoose.Types.ObjectId())}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('optionalAuthenticate', () => {
  /**
   * `GET /api/debates` is public but supports `?myDebates=true`, for which the
   * controller reads `req.user._id`. With no middleware attaching a user, that
   * threw a TypeError for anonymous callers; with `authenticate`, the public
   * listing would have stopped being public.
   */
  test('a valid token is honoured', async () => {
    const user = await makeUser();

    const res = await request(appWith(optionalAuthenticate))
      .get('/probe')
      .set('Authorization', `Bearer ${generateToken(user._id)}`);

    expect(res.body.user).toBe('probe_user');
  });

  test('no token still reaches the handler, with no user', async () => {
    const res = await request(appWith(optionalAuthenticate)).get('/probe');

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  test('an invalid token is treated as signed-out rather than as an error', async () => {
    const res = await request(appWith(optionalAuthenticate))
      .get('/probe')
      .set('Authorization', 'Bearer nonsense');

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });
});

describe('debate route registration', () => {
  /**
   * An inline `GET /:debateId/score` was registered above everything else and
   * shadowed `GET /:id/score`, making the real controller unreachable. Express
   * matches in registration order, and the two patterns are identical in shape,
   * so only the first could ever run.
   */
  test('exactly one handler is registered for the score path', async () => {
    const { default: debateRoutes } = await import('../src/routes/debateRoutes.js');

    const scoreRoutes = debateRoutes.stack
      .filter(layer => layer.route)
      .map(layer => layer.route)
      .filter(route => route.path.endsWith('/score'));

    expect(scoreRoutes).toHaveLength(1);
    expect(scoreRoutes[0].path).toBe('/:id/score');
  });

  test('no two GET routes share a path', async () => {
    const { default: debateRoutes } = await import('../src/routes/debateRoutes.js');

    const getPaths = debateRoutes.stack
      .filter(layer => layer.route?.methods?.get)
      .map(layer => layer.route.path);

    expect(new Set(getPaths).size).toBe(getPaths.length);
  });
});
