import express from 'express';
import request from 'supertest';

const { logger, requestLogger } = await import('../src/utils/logger.js');

describe('logger redaction', () => {
  let captured;
  let originalLog;

  beforeEach(() => {
    captured = [];
    originalLog = console.log;
    console.log = (...args) => captured.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
  });

  test('never writes a password, token or secret', () => {
    logger.info('login attempt', {
      email: 'user@example.com',
      password: 'hunter2',
      token: 'eyJhbGciOi',
      apiKey: 'gsk_live_secret',
    });

    const line = captured.join(' ');
    expect(line).toContain('user@example.com');
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('eyJhbGciOi');
    expect(line).not.toContain('gsk_live_secret');
    expect(line).toContain('[redacted]');
  });

  test('redacts nested credentials', () => {
    logger.info('nested', { user: { name: 'Ada', authorization: 'Bearer abc123' } });

    const line = captured.join(' ');
    expect(line).toContain('Ada');
    expect(line).not.toContain('abc123');
  });

  test('child loggers stamp their bound fields', () => {
    logger.child({ requestId: 'req-1' }).info('did a thing');
    expect(captured.join(' ')).toContain('req-1');
  });
});

describe('requestLogger', () => {
  test('assigns a request id and returns it to the client', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/x', (req, res) => res.json({ id: req.id }));

    const res = await request(app).get('/x');

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.id).toBe(res.headers['x-request-id']);
  });

  test('honours an incoming request id so traces span services', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/x', (req, res) => res.json({ id: req.id }));

    const res = await request(app).get('/x').set('x-request-id', 'trace-abc');

    expect(res.body.id).toBe('trace-abc');
  });

  test('exposes a bound logger on the request', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/x', (req, res) => res.json({ hasLogger: typeof req.log?.info === 'function' }));

    expect((await request(app).get('/x')).body.hasLogger).toBe(true);
  });
});
