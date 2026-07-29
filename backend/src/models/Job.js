import mongoose from 'mongoose';

/**
 * Durable background job.
 *
 * Backed by MongoDB rather than Redis because Redis is optional in this
 * deployment — a queue that only works when an optional dependency is running
 * is not durable. The database is already required, already replicated, and
 * `findOneAndUpdate` gives the atomic claim a worker needs.
 */
const jobSchema = new mongoose.Schema({
  type: { type: String, required: true, index: true },

  payload: { type: mongoose.Schema.Types.Mixed, default: {} },

  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },

  attempts:    { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },

  // Enables both delayed jobs and exponential backoff between retries.
  runAfter: { type: Date, default: Date.now, index: true },

  // Set when a worker claims the job; a stale value means the worker died and
  // the job is eligible to be reclaimed.
  lockedAt:  { type: Date, default: null },
  lockedBy:  { type: String, default: null },

  lastError:   { type: String, default: null },
  completedAt: { type: Date, default: null },

  // Prevents duplicate work when the same event is enqueued twice.
  dedupeKey: { type: String, default: null },
}, { timestamps: true });

// The claim query: pending jobs whose time has come, oldest first.
jobSchema.index({ status: 1, runAfter: 1 });
jobSchema.index({ dedupeKey: 1, status: 1 });

// Completed jobs are evidence for about a day, then noise.
jobSchema.index({ completedAt: 1 }, { expireAfterSeconds: 86400 });

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

export default Job;
