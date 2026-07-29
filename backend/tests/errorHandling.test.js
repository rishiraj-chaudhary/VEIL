import express from 'express';
import request from 'supertest';

/**
 * Central error handling.
 *
 * The important guarantee is negative: driver, validation and JWT errors carry
 * connection strings, query fragments and internal paths, and none of that may
 * reach a client. The status mapping matters less than the leak not happening.
 */

const { asyncHandler, errorHandler, notFoundHandler } = await import('../src/middleware/errorHandler.js');
const { AppError, notFound, forbidden, badRequest } = await import('../src/utils/AppError.js');

const buildApp = (register) => {
  const app = express();
  app.use(express.json());
  register(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe('errorHandler', () => {
  test('AppError keeps its status and message', async () => {
    const app = buildApp(a => a.get('/x', asyncHandler(async () => { throw notFound('Post not found'); })));
    const res = await request(app).get('/x');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Post not found' });
  });

  test('forbidden maps to 403', async () => {
    const app = buildApp(a => a.get('/x', asyncHandler(async () => { throw forbidden('Not yours'); })));
    expect((await request(app).get('/x')).status).toBe(403);
  });

  test('validation details survive to the client', async () => {
    const app = buildApp(a => a.get('/x', asyncHandler(async () => {
      throw badRequest('Validation failed', { details: [{ field: 'email', message: 'is invalid' }] });
    })));
    const res = await request(app).get('/x');

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'email', message: 'is invalid' }]);
  });

  test('an unexpected error never leaks its message', async () => {
    const app = buildApp(a => a.get('/x', asyncHandler(async () => {
      throw new Error('connection failed for mongodb+srv://admin:hunter2@cluster');
    })));
    const res = await request(app).get('/x');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  test('mongoose CastError becomes a 400', async () => {
    const app = buildApp(a => a.get('/x', asyncHandler(async () => {
      const err = new Error('cast');
      err.name = 'CastError';
      err.path = 'id';
      throw err;
    })));
    const res = await request(app).get('/x');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('id');
  });

  test('duplicate key becomes a 409 naming the field', async () => {
    const app = buildApp(a => a.get('/x', asyncHandler(async () => {
      const err = new Error('dup');
      err.code = 11000;
      err.keyPattern = { username: 1 };
      throw err;
    })));
    const res = await request(app).get('/x');

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('username');
  });

  test('expired token becomes a 401', async () => {
    const app = buildApp(a => a.get('/x', asyncHandler(async () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      throw err;
    })));
    expect((await request(app).get('/x')).status).toBe(401);
  });

  test('unknown routes 404 with the method and path', async () => {
    const res = await request(buildApp(() => {})).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('GET');
    expect(res.body.message).toContain('/nope');
  });
});

describe('asyncHandler', () => {
  test('a rejected promise reaches the error pipeline instead of hanging', async () => {
    const app = buildApp(a => a.get('/x', asyncHandler(async () => {
      await Promise.resolve();
      throw new AppError('async failure', 418);
    })));

    expect((await request(app).get('/x')).status).toBe(418);
  });

  test('successful handlers pass through untouched', async () => {
    const app = buildApp(a => a.get('/x', asyncHandler(async (req, res) => res.json({ ok: true }))));
    const res = await request(app).get('/x');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
