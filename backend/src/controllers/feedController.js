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

import Post from '../models/post.js';
import feedRankingGraph from '../services/graph/feedRankingGraph.js';

/**
 * GET /api/feed
 * Returns personalised AI-ranked feed for authenticated user.
 * Falls back to chronological feed if graph fails.
 */
export const getPersonalisedFeed = async (req, res) => {
  try {
    const userId = req.user?._id || req.query.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required for personalised feed' });
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    console.log(`🎯 FeedRankingGraph: running for user ${userId}, page ${page}`);

    const result = await feedRankingGraph.run(userId, { limit, page });

    return res.status(200).json({
      success: true,
      data: {
        posts:      result.feed,
        total:      result.total,
        page:       result.page,
        ranked:     true,
        generatedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Personalised feed error:', error);

    // Fallback: return recent posts
    const posts = await Post.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('author', 'username karma')
      .populate('community', 'name displayName')
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        posts,
        total:   posts.length,
        page:    1,
        ranked:  false,
        fallback: true,
      },
    });
  }
};

/**
 * GET /api/feed/why/:postId
 * Returns the ranking explanation for a specific post in the user's feed.
 * Runs a mini feed rank just for this post.
 */
export const getWhyExplanation = async (req, res) => {
  try {
    const userId = req.user?._id || req.query.userId;
    const { postId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const post = await Post.findOne({ _id: postId, isDeleted: false })
      .populate('author', 'username')
      .populate('community', 'name displayName')
      .lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Run feed graph and find this post in the result
    const result = await feedRankingGraph.run(userId, { limit: 60 });
    const found  = result.feed.find(p => p._id?.toString() === postId);

    if (found) {
      return res.status(200).json({
        success: true,
        data: {
          postId,
          why:    found._why,
          scores: found._rankScores,
        },
      });
    }

    // Post wasn't ranked — give a generic explanation
    return res.status(200).json({
      success: true,
      data: {
        postId,
        why:    'This post is from a community you follow.',
        scores: null,
      },
    });

  } catch (error) {
    console.error('Why explanation error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate explanation' });
  }
};

/**
 * POST /api/feed/classify/:postId
 * Manually trigger intent classification for a post (admin/dev utility).
 */
export const classifyPostIntent = async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.postId, isDeleted: false }).lean();
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    // Use internal batch classifier via a single-item array
    await feedRankingGraph._classifyIntentBatch([post]);

    const updated = await Post.findById(post._id)
      .select('intentType intentConfidence intentClassifiedAt')
      .lean();

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('Classify intent error:', error);
    res.status(500).json({ success: false, message: 'Classification failed' });
  }
};