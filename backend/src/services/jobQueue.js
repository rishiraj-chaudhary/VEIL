import crypto from 'crypto';
import Job from '../models/Job.js';
import logger from '../utils/logger.js';

/**
 * JOB QUEUE
 *
 * Replaces `setImmediate` for background work.
 *
 * `setImmediate` runs the callback in this process, once, with no record that it
 * was ever scheduled. A deploy, a crash, or an unhandled rejection silently
 * loses the work — and the AI pipelines it was used for (turn analysis follow-up,
 * refutation detection, huddle summarisation) are exactly the work whose absence
 * is invisible until someone notices their data is wrong.
 *
 * Jobs here survive restarts, retry with backoff, and leave a failure record.
 */

const WORKER_ID = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

const POLL_INTERVAL_MS = parseInt(process.env.JOB_POLL_INTERVAL_MS, 10) || 2000;
const CONCURRENCY      = parseInt(process.env.JOB_CONCURRENCY, 10) || 3;
const LOCK_TIMEOUT_MS  = parseInt(process.env.JOB_LOCK_TIMEOUT_MS, 10) || 5 * 60 * 1000;
const BASE_BACKOFF_MS  = 5000;

class JobQueue {
  constructor() {
    this.handlers = new Map();
    this.running = false;
    this.timer = null;
    this.active = 0;
    this.stats = { processed: 0, failed: 0 };
  }

  /** Registers the function that performs a job type. */
  register(type, handler) {
    this.handlers.set(type, handler);
  }

  /**
   * Queues work. Falls back to running inline if the enqueue itself fails —
   * losing the job entirely would be worse than running it without durability.
   */
  async enqueue(type, payload = {}, { delayMs = 0, maxAttempts = 3, dedupeKey = null } = {}) {
    try {
      if (dedupeKey) {
        const existing = await Job.findOne({
          dedupeKey,
          status: { $in: ['pending', 'running'] },
        }).select('_id').lean();

        if (existing) return existing._id;
      }

      const job = await Job.create({
        type,
        payload,
        maxAttempts,
        dedupeKey,
        runAfter: new Date(Date.now() + delayMs),
      });

      return job._id;

    } catch (error) {
      logger.error('job enqueue failed, running inline', { type, error: error.message });

      const handler = this.handlers.get(type);
      if (handler) {
        Promise.resolve(handler(payload))
          .catch(err => logger.error('inline job failed', { type, error: err.message }));
      }
      return null;
    }
  }

  /**
   * Atomically claims one job. The filter also matches jobs whose lock has
   * expired, so work is recovered when a worker dies mid-job rather than being
   * stuck in `running` forever.
   */
  async _claim() {
    const now = new Date();
    const staleLock = new Date(now.getTime() - LOCK_TIMEOUT_MS);

    return Job.findOneAndUpdate(
      {
        runAfter: { $lte: now },
        $or: [
          { status: 'pending' },
          { status: 'running', lockedAt: { $lt: staleLock } },
        ],
      },
      {
        $set: { status: 'running', lockedAt: now, lockedBy: WORKER_ID },
        $inc: { attempts: 1 },
      },
      { sort: { runAfter: 1 }, new: true },
    );
  }

  async _run(job) {
    const handler = this.handlers.get(job.type);

    if (!handler) {
      await Job.updateOne({ _id: job._id }, {
        $set: { status: 'failed', lastError: `No handler registered for '${job.type}'` },
      });
      logger.error('job has no handler', { type: job.type, jobId: job._id.toString() });
      return;
    }

    const startedAt = Date.now();

    try {
      await handler(job.payload, job);

      await Job.updateOne({ _id: job._id }, {
        $set: { status: 'completed', completedAt: new Date(), lockedAt: null, lockedBy: null },
      });

      this.stats.processed += 1;
      logger.debug('job completed', {
        type: job.type, jobId: job._id.toString(), durationMs: Date.now() - startedAt,
      });

    } catch (error) {
      const exhausted = job.attempts >= job.maxAttempts;

      await Job.updateOne({ _id: job._id }, {
        $set: {
          status: exhausted ? 'failed' : 'pending',
          lastError: error.message,
          lockedAt: null,
          lockedBy: null,
          // Exponential backoff: a failing dependency should not be hammered.
          runAfter: new Date(Date.now() + BASE_BACKOFF_MS * (2 ** (job.attempts - 1))),
        },
      });

      if (exhausted) this.stats.failed += 1;

      logger.error(exhausted ? 'job failed permanently' : 'job failed, will retry', {
        type: job.type,
        jobId: job._id.toString(),
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        error: error.message,
      });
    }
  }

  async _tick() {
    while (this.running && this.active < CONCURRENCY) {
      let job;
      try {
        job = await this._claim();
      } catch (error) {
        logger.error('job claim failed', { error: error.message });
        return;
      }

      if (!job) return;

      this.active += 1;
      this._run(job).finally(() => { this.active -= 1; });
    }
  }

  start() {
    if (this.running) return;
    if (process.env.JOB_WORKER_ENABLED === 'false') {
      logger.info('job worker disabled by config');
      return;
    }

    this.running = true;
    this.timer = setInterval(() => {
      this._tick().catch(err => logger.error('job tick failed', { error: err.message }));
    }, POLL_INTERVAL_MS);

    this.timer.unref?.();
    logger.info('job worker started', { workerId: WORKER_ID, concurrency: CONCURRENCY });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    logger.info('job worker stopped', { ...this.stats });
  }

  getStatus() {
    return { running: this.running, workerId: WORKER_ID, active: this.active, ...this.stats };
  }
}

export default new JobQueue();
