import Post from '../models/post.js';
import RankedFeed from '../models/RankedFeed.js';
import feedRankingGraph from './graph/feedRankingGraph.js';

/**
 * FEED PRECOMPUTE SERVICE
 *
 * The ranking graph makes LLM and embedding calls, which is far too slow to run
 * inside a request. Rankings are computed in the background and stored as an
 * ordered list of post ids; requests read that list and hydrate the page they
 * need. Reads become two indexed queries with no external calls.
 *
 * Freshness follows stale-while-revalidate: a stale ranking is still served
 * immediately while a refresh runs behind it, so a user never waits on the graph
 * except on their very first request.
 */

const RANKED_DEPTH   = parseInt(process.env.FEED_RANKED_DEPTH, 10) || 60;
const STALE_AFTER_MS = (parseInt(process.env.FEED_STALE_AFTER_SECONDS, 10) || 600) * 1000;
const COMPUTE_LOCK_MS = 2 * 60 * 1000;

class FeedPrecomputeService {
  constructor() {
    this.inFlight = new Map();
  }

  isStale(rankedFeed) {
    if (!rankedFeed?.generatedAt) return true;
    return Date.now() - rankedFeed.generatedAt.getTime() > STALE_AFTER_MS;
  }

  /**
   * Runs the ranking graph and persists the result.
   *
   * Deduplicated per user both in-process (`inFlight`) and across processes
   * (`computingSince`), so a burst of requests triggers one computation.
   */
  async recompute(userId) {
    const key = userId.toString();
    if (this.inFlight.has(key)) return this.inFlight.get(key);

    const task = this._runAndStore(key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    return task;
  }

  async _runAndStore(userId) {
    const lockCutoff = new Date(Date.now() - COMPUTE_LOCK_MS);

    const claimed = await RankedFeed.findOneAndUpdate(
      {
        user: userId,
        $or: [{ computingSince: null }, { computingSince: { $lt: lockCutoff } }],
      },
      { $set: { computingSince: new Date() }, $setOnInsert: { user: userId } },
      { upsert: true, new: true },
    ).catch(err => {
      // Duplicate key means another process created the row first — not an error.
      if (err.code === 11000) return null;
      throw err;
    });

    if (!claimed) return null;

    try {
      const result = await feedRankingGraph.run(userId, { limit: RANKED_DEPTH, page: 1 });

      const entries = (result.feed || []).map(item => ({
        post:   item._id,
        score:  item._rankScores?.final ?? 0,
        why:    item._why || '',
        scores: item._rankScores || null,
      }));

      await RankedFeed.updateOne(
        { user: userId },
        {
          $set: {
            entries,
            generatedAt: new Date(),
            computingSince: null,
            lastError: null,
          },
        },
      );

      console.log(`🗂️  Feed precomputed for ${userId} — ${entries.length} entries`);
      return entries.length;

    } catch (error) {
      await RankedFeed.updateOne(
        { user: userId },
        { $set: { computingSince: null, lastError: error.message } },
      ).catch(() => {});

      console.error(`❌ Feed precompute failed for ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Returns a page of the stored ranking with posts hydrated from the live
   * collection. Computes synchronously only when nothing has been stored yet.
   */
  async getPage(userId, { page = 1, limit = 20 } = {}) {
    let rankedFeed = await RankedFeed.findOne({ user: userId }).lean();

    if (!rankedFeed?.entries?.length) {
      await this.recompute(userId).catch(() => {});
      rankedFeed = await RankedFeed.findOne({ user: userId }).lean();
    } else if (this.isStale(rankedFeed)) {
      // Serve what we have; refresh behind the response.
      this.recompute(userId).catch(() => {});
    }

    const entries = rankedFeed?.entries || [];
    const start = (page - 1) * limit;
    const slice = entries.slice(start, start + limit);

    if (slice.length === 0) {
      return { posts: [], total: entries.length, page, generatedAt: rankedFeed?.generatedAt || null };
    }

    const ids = slice.map(entry => entry.post);
    const posts = await Post.find({ _id: { $in: ids }, isDeleted: false })
      .populate('author', 'username karma')
      .populate('community', 'name displayName')
      .lean();

    // $in returns documents in arbitrary order — restore the ranked order and
    // drop anything deleted since the ranking was computed.
    const byId = new Map(posts.map(post => [post._id.toString(), post]));

    const ordered = slice
      .map(entry => {
        const post = byId.get(entry.post.toString());
        if (!post) return null;
        return { ...post, _rankScores: entry.scores, _why: entry.why };
      })
      .filter(Boolean);

    return {
      posts: ordered,
      total: entries.length,
      page,
      generatedAt: rankedFeed?.generatedAt || null,
    };
  }

  async invalidate(userId) {
    await RankedFeed.updateOne({ user: userId }, { $set: { generatedAt: new Date(0) } }).catch(() => {});
  }
}

export default new FeedPrecomputeService();
export { RANKED_DEPTH, STALE_AFTER_MS };
