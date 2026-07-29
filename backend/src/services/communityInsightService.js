import Comment from '../models/comment.js';
import Community from '../models/community.js';
import Post from '../models/post.js';
import logger from '../utils/logger.js';
import communityHealthGraph from './graph/communityHealthGraph.js';
import communityMemoryGraph from './graph/communityMemoryGraph.js';

/**
 * COMMUNITY INSIGHT
 *
 * Single entry point for both community analyses.
 *
 * The health and memory graphs each loaded the same community, the same recent
 * posts, and the same comments independently — two full passes over identical
 * data to answer two questions about it. When both are wanted (which is the
 * only time either is shown), this loads once and hands the result to both.
 *
 * The graphs remain independently runnable; this is a shared loader, not a
 * rewrite of either.
 */

const MAX_POSTS    = 50;
const MAX_COMMENTS = 100;

class CommunityInsightService {
  /** One read of everything both graphs need. */
  async loadContext(communityId) {
    const community = await Community.findById(communityId).lean();
    if (!community) return null;

    const posts = await Post.find({ community: communityId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(MAX_POSTS)
      .populate('author', 'username')
      .lean();

    if (posts.length === 0) return { community, posts: [], comments: [] };

    const comments = await Comment.find({
      post: { $in: posts.map(p => p._id) },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(MAX_COMMENTS)
      .populate('author', 'username')
      .lean();

    return { community, posts, comments };
  }

  /**
   * Both analyses for one community.
   *
   * Run in parallel because neither depends on the other's output — they only
   * shared their inputs, which are now fetched once above.
   */
  async getInsights(communityId, options = {}) {
    const context = await this.loadContext(communityId);

    if (!context) return { health: null, memory: null, reason: 'community not found' };
    if (context.posts.length === 0) {
      return { health: null, memory: null, reason: 'no posts to analyse' };
    }

    const [health, memory] = await Promise.all([
      communityHealthGraph.run(communityId, options).catch(err => {
        logger.warn('community health analysis failed', { communityId: String(communityId), error: err.message });
        return null;
      }),
      communityMemoryGraph.run(communityId, options).catch(err => {
        logger.warn('community memory analysis failed', { communityId: String(communityId), error: err.message });
        return null;
      }),
    ]);

    return {
      health,
      memory,
      stats: {
        posts: context.posts.length,
        comments: context.comments.length,
      },
    };
  }
}

export default new CommunityInsightService();
export { MAX_POSTS, MAX_COMMENTS };
