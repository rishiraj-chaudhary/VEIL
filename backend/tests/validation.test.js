import express from 'express';
import request from 'supertest';

const { validate } = await import('../src/middleware/validate.js');
const { authValidators, postValidators, commentValidators } = await import('../src/validators/index.js');
const { errorHandler } = await import('../src/middleware/errorHandler.js');

const appWith = (method, path, chains) => {
  const app = express();
  app.use(express.json());
  app[method](path, validate(chains), (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
};

const VALID_ID = '507f1f77bcf86cd799439011';

describe('auth validation', () => {
  const app = appWith('post', '/register', authValidators.register);

  test('rejects a short username, bad email and weak password together', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: 'a', email: 'not-an-email', password: '123' });

    expect(res.status).toBe(400);
    const fields = res.body.errors.map(e => e.field);
    expect(fields).toEqual(expect.arrayContaining(['username', 'email', 'password']));
  });

  test('rejects usernames with punctuation', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: 'bad name!', email: 'a@b.com', password: 'longenough1' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some(e => e.field === 'username')).toBe(true);
  });

  test('accepts valid credentials', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: 'good_name1', email: 'a@b.com', password: 'longenough1' });

    expect(res.status).toBe(200);
  });
});

describe('post validation', () => {
  test('sort must be one of the known values', async () => {
    const app = appWith('get', '/posts', postValidators.list);
    const res = await request(app).get('/posts?sort=sideways');

    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('sort');
  });

  test('limit is bounded', async () => {
    const app = appWith('get', '/posts', postValidators.list);

    expect((await request(app).get('/posts?limit=9999')).status).toBe(400);
    expect((await request(app).get('/posts?limit=0')).status).toBe(400);
    expect((await request(app).get('/posts?limit=20')).status).toBe(200);
  });

  test('an absent optional query is accepted', async () => {
    const app = appWith('get', '/posts', postValidators.list);
    expect((await request(app).get('/posts')).status).toBe(200);
  });

  test('vote value must be 1, -1 or 0', async () => {
    const app = appWith('post', '/posts/:id/vote', postValidators.vote);

    expect((await request(app).post(`/posts/${VALID_ID}/vote`).send({ vote: 5 })).status).toBe(400);
    expect((await request(app).post(`/posts/${VALID_ID}/vote`).send({ vote: 1 })).status).toBe(200);
    expect((await request(app).post(`/posts/${VALID_ID}/vote`).send({ vote: 0 })).status).toBe(200);
  });

  test('malformed ids are rejected before reaching the controller', async () => {
    const app = appWith('get', '/posts/:id', postValidators.byId);

    expect((await request(app).get('/posts/not-an-id')).status).toBe(400);
    expect((await request(app).get(`/posts/${VALID_ID}`)).status).toBe(200);
  });
});

describe('comment validation', () => {
  test('content cannot be empty', async () => {
    const app = appWith('post', '/comments', commentValidators.create);
    const res = await request(app).post('/comments').send({ content: '   ', postId: VALID_ID });

    expect(res.status).toBe(400);
  });

  test('postId must be a valid id', async () => {
    const app = appWith('post', '/comments', commentValidators.create);
    const res = await request(app).post('/comments').send({ content: 'a real comment', postId: 'nope' });

    expect(res.status).toBe(400);
  });
});
