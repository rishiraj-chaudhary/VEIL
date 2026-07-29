/**
 * FEED CONTROLLER — Step 12
 *
 * Exposes the AI-ranked feed from FeedRankingGraph.
 * Also keeps the existing getPosts() behaviour as fallback for
 * unauthenticated or community-filtered requests.
 *
 * New routes:
 *   GET /api/feed              — personalised ranked feed (auth required)
 *   GET /api/feed/why/:postId  — explanation for why a post was shown
 *
 * Place at: backend/src/controllers/feedController.js
 */

import { asyncHandler } from '../middleware/errorHandler.js';
import Post from '../models/post.js';
import RankedFeed from '../models/RankedFeed.js';
import feedPrecomputeService from '../services/feedPrecomputeService.js';
import feedRankingGraph from '../services/graph/feedRankingGraph.js';
import { notFound, unauthorized } from '../utils/AppError.js';

/**
 * GET /api/feed
 * Returns personalised AI-ranked feed for authenticated user.
 *
 * Reads the precomputed ranking rather than running the graph inline — the
 * graph's LLM and embedding calls belong in the background worker, not on a
 * request that a user is waiting on. Falls back to a chronological feed if no
 * ranking can be produced.
 */
export const getPersonalisedFeed = asyncHandler(async (req, res) => {
  // Identity comes from the verified token only — a query param would let any
  // caller pull another user's personalised feed.
  const userId = req.user?._id;
  if (!userId) throw unauthorized('Authentication required for personalised feed');

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);

  try {
    const result = await feedPrecomputeService.getPage(userId, { page, limit });

    if (result.posts.length > 0 || page > 1) {
      return res.status(200).json({
        success: true,
        data: {
          posts:       result.posts,
          total:       result.total,
          page:        result.page,
          ranked:      true,
          generatedAt: result.generatedAt,
        },
      });
    }
  } catch (error) {
    console.error('Personalised feed error:', error.message);
  }

  // Fallback: chronological. Reached when ranking has never succeeded for this
  // user (brand new account, or the graph is failing).
  const posts = await Post.find({ isDeleted: false })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('author', 'username karma')
    .populate('community', 'name displayName')
    .lean();

  return res.status(200).json({
    success: true,
    data: {
      posts,
      total:    posts.length,
      page,
      ranked:   false,
      fallback: true,
    },
  });
});

/**
 * GET /api/feed/why/:postId
 * Returns the ranking explanation for a specific post in the user's feed.
 * Runs a mini feed rank just for this post.
 */
export const getWhyExplanation = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const { postId } = req.params;

  if (!userId) throw unauthorized('Authentication required');

  const post = await Post.findOne({ _id: postId, isDeleted: false }).select('_id').lean();
  if (!post) throw notFound('Post not found');

  // The explanation is stored alongside the ranking, so this is a single indexed
  // lookup. It previously re-ran the whole ranking graph to explain one post.
  const rankedFeed = await RankedFeed.findOne(
    { user: userId, 'entries.post': postId },
    { 'entries.$': 1 },
  ).lean();

  const entry = rankedFeed?.entries?.[0];

  return res.status(200).json({
    success: true,
    data: {
      postId,
      why:    entry?.why || 'This post is from a community you follow.',
      scores: entry?.scores || null,
    },
  });
});

/**
 * POST /api/feed/classify/:postId
 * Manually trigger intent classification for a post (admin/dev utility).
 */
export const classifyPostIntent = asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.postId, isDeleted: false }).lean();
  if (!post) throw notFound('Post not found');

  // Use internal batch classifier via a single-item array
  await feedRankingGraph._classifyIntentBatch([post]);

  const updated = await Post.findById(post._id)
    .select('intentType intentConfidence intentClassifiedAt')
    .lean();

  res.status(200).json({ success: true, data: updated });
});