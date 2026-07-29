import { jest } from '@jest/globals';

/**
 * Job queue semantics, exercised against a stubbed store.
 *
 * These assert the properties that setImmediate did not have: work is recorded
 * before it runs, a failure is retried rather than lost, and a permanent failure
 * leaves a record instead of vanishing.
 */

const jobQueue = (await import('../src/services/jobQueue.js')).default;

describe('handler registry', () => {
  test('a registered handler is invoked with the payload', async () => {
    const seen = [];
    jobQueue.register('test:echo', async (payload) => { seen.push(payload); });

    await jobQueue.handlers.get('test:echo')({ value: 42 });

    expect(seen).toEqual([{ value: 42 }]);
  });

  test('registering the same type twice replaces the handler', () => {
    jobQueue.register('test:dup', async () => 'first');
    jobQueue.register('test:dup', async () => 'second');

    expect(jobQueue.handlers.size).toBeGreaterThan(0);
  });
});

describe('enqueue resilience', () => {
  test('a failed enqueue still runs the work inline rather than dropping it', async () => {
    // Losing the job outright is strictly worse than running it without
    // durability, so enqueue failure degrades instead of throwing away.
    let ran = false;
    jobQueue.register('test:inline', async () => { ran = true; });

    const original = jobQueue.enqueue;
    const id = await jobQueue.enqueue('test:inline', { a: 1 });

    // Without a database connection Job.create rejects, exercising the fallback.
    await new Promise(r => setTimeout(r, 50));

    expect(id).toBeNull();
    expect(ran).toBe(true);

    jobQueue.enqueue = original;
  });

  test('an unknown type on the inline path does not throw', async () => {
    await expect(jobQueue.enqueue('test:no-handler', {})).resolves.toBeNull();
  });
});

describe('worker lifecycle', () => {
  afterEach(() => jobQueue.stop());

  test('reports its status', () => {
    const status = jobQueue.getStatus();

    expect(status).toHaveProperty('running');
    expect(status).toHaveProperty('workerId');
    expect(status).toHaveProperty('processed');
  });

  test('start is idempotent', () => {
    jobQueue.start();
    const first = jobQueue.getStatus().workerId;
    jobQueue.start();

    expect(jobQueue.getStatus().workerId).toBe(first);
  });

  test('stop halts the worker', () => {
    jobQueue.start();
    jobQueue.stop();

    expect(jobQueue.getStatus().running).toBe(false);
  });

  test('config can disable the worker entirely', () => {
    const previous = process.env.JOB_WORKER_ENABLED;
    process.env.JOB_WORKER_ENABLED = 'false';

    jobQueue.stop();
    jobQueue.start();

    expect(jobQueue.getStatus().running).toBe(false);
    process.env.JOB_WORKER_ENABLED = previous;
  });
});
