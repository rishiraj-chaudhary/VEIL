import express from 'express';
import request from 'supertest';

/**
 * Rate limiting.
 *
 * Redis is unreachable in this environment on purpose: the limiter must still
 * enforce a ceiling. A limiter that disables itself when its store is down
 * offers no protection at exactly the moment the system is already struggling —
 * and on this platform every unlimited request costs money at an LLM provider.
 */

const { rateLimit } = await import('../src/middleware/rateLimit.js');

const appWith = (options) => {
  const app = express();
  app.use(rateLimit(options));
  app.get('/x', (req, res) => res.json({ ok: true }));
  return app;
};

describe('rateLimit', () => {
  test('allows up to the limit, then returns 429', async () => {
    const app = appWith({ windowMs: 60_000, max: 3, keyPrefix: `t${Date.now()}a` });

    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/x')).status).toBe(200);
    }

    const blocked = await request(app).get('/x');
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
  });

  test('still enforces a ceiling with Redis unavailable', async () => {
    const app = appWith({ windowMs: 60_000, max: 2, keyPrefix: `t${Date.now()}b` });

    await request(app).get('/x');
    await request(app).get('/x');

    expect((await request(app).get('/x')).status).toBe(429);
  });

  test('reports remaining quota in headers', async () => {
    const app = appWith({ windowMs: 60_000, max: 5, keyPrefix: `t${Date.now()}c` });
    const res = await request(app).get('/x');

    expect(res.headers['ratelimit-limit']).toBe('5');
    expect(res.headers['ratelimit-remaining']).toBe('4');
    expect(res.headers['ratelimit-reset']).toBeDefined();
  });

  test('a blocked response tells the client when to retry', async () => {
    const app = appWith({ windowMs: 60_000, max: 1, keyPrefix: `t${Date.now()}d` });

    await request(app).get('/x');
    const blocked = await request(app).get('/x');

    expect(blocked.headers['retry-after']).toBeDefined();
    expect(Number(blocked.body.retryAfter)).toBeGreaterThan(0);
  });

  test('separate keys are counted independently', async () => {
    let caller = 'first';
    const app = express();
    app.use(rateLimit({ windowMs: 60_000, max: 1, keyPrefix: `t${Date.now()}e`, keyGenerator: () => caller }));
    app.get('/x', (req, res) => res.json({ ok: true }));

    expect((await request(app).get('/x')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(429);

    caller = 'second';
    expect((await request(app).get('/x')).status).toBe(200);
  });
});
