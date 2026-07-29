import RankedFeed from '../models/RankedFeed.js';
import User from '../models/user.js';
import feedPrecomputeService, { STALE_AFTER_MS } from './feedPrecomputeService.js';

/**
 * FEED SCHEDULER
 *
 * Refreshes stale rankings in the background so requests almost always hit a
 * warm feed. Only users who have logged in recently are refreshed — precomputing
 * for dormant accounts burns LLM calls on feeds nobody will read.
 *
 * Users are processed with a small concurrency limit rather than all at once,
 * because each refresh runs the ranking graph and hits rate-limited providers.
 */

const INTERVAL_MS       = (parseInt(process.env.FEED_REFRESH_INTERVAL_SECONDS, 10) || 300) * 1000;
const ACTIVE_WINDOW_MS  = (parseInt(process.env.FEED_ACTIVE_WINDOW_HOURS, 10) || 48) * 60 * 60 * 1000;
const MAX_PER_CYCLE     = parseInt(process.env.FEED_REFRESH_BATCH, 10) || 20;
const CONCURRENCY       = parseInt(process.env.FEED_REFRESH_CONCURRENCY, 10) || 3;

class FeedScheduler {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.lastRunAt = null;
    this.lastRefreshed = 0;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️ Feed scheduler already running');
      return;
    }

    if (process.env.FEED_PRECOMPUTE_ENABLED === 'false') {
      console.log('⏸️  Feed precompute scheduler disabled by config');
      return;
    }

    this.isRunning = true;

    this.interval = setInterval(() => {
      this.refreshStaleFeeds().catch(err =>
        console.error('Feed refresh cycle error:', err.message)
      );
    }, INTERVAL_MS);

    // Don't hold the process open purely for this timer.
    this.interval.unref?.();

    console.log(`✅ Feed scheduler started (every ${INTERVAL_MS / 1000}s)`);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.isRunning = false;
    console.log('🛑 Feed scheduler stopped');
  }

  async refreshStaleFeeds() {
    const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MS);

    const activeUsers = await User.find({
      isActive: true,
      isSystem: { $ne: true }, // the AI opponent has no feed to precompute
      $or: [{ lastLogin: { $gte: activeSince } }, { updatedAt: { $gte: activeSince } }],
    })
      .select('_id')
      .limit(MAX_PER_CYCLE * 3)
      .lean();

    if (activeUsers.length === 0) return;

    const staleCutoff = new Date(Date.now() - STALE_AFTER_MS);
    const userIds = activeUsers.map(u => u._id);

    const fresh = await RankedFeed.find({
      user: { $in: userIds },
      generatedAt: { $gte: staleCutoff },
    })
      .select('user')
      .lean();

    const freshSet = new Set(fresh.map(f => f.user.toString()));
    const targets = userIds
      .filter(id => !freshSet.has(id.toString()))
      .slice(0, MAX_PER_CYCLE);

    if (targets.length === 0) return;

    let refreshed = 0;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const slice = targets.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        slice.map(id => feedPrecomputeService.recompute(id))
      );
      refreshed += results.filter(r => r.status === 'fulfilled').length;
    }

    this.lastRunAt = new Date();
    this.lastRefreshed = refreshed;
    console.log(`🗂️  Feed scheduler refreshed ${refreshed}/${targets.length} stale feeds`);
  }

  getStatus() {
    return {
      running: this.isRunning,
      intervalSeconds: INTERVAL_MS / 1000,
      lastRunAt: this.lastRunAt,
      lastRefreshed: this.lastRefreshed,
    };
  }
}

export default new FeedScheduler();
