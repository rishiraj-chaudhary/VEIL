/**
 * THREAD CONTROLLER — Step 13
 *
 * Exposes ThreadEvolutionGraph results.
 *
 * Routes:
 *   GET  /api/thread/:postId/analysis   — get (or trigger) thread analysis
 *   POST /api/thread/:postId/analyse    — force re-analysis
 *
 * Place at: backend/src/controllers/threadController.js
 */

import Post from '../models/post.js';
import threadEvolutionGraph from '../services/graph/threadEvolutionGraph.js';

/**
 * GET /api/thread/:postId/analysis
 * Returns cached analysis if fresh, otherwise triggers a new one.
 */
export const getThreadAnalysis = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findOne({ _id: postId, isDeleted: false })
      .select('threadAnalysis commentCount title')
      .lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const existing = post.threadAnalysis;

    // Return cache if it exists and is reasonably fresh
    if (existing?.analysedAt && existing?.healthScore !== null) {
      const commentsSince = post.commentCount - (existing.commentCountAtAnalysis || 0);
      if (commentsSince < 5) {
        return res.status(200).json({
          success: true,
          data: { analysis: existing, cached: true },
        });
      }
    }

    // Run fresh analysis (non-blocking response if thread is large)
    const analysis = await threadEvolutionGraph.run(postId);

    return res.status(200).json({
      success: true,
      data: { analysis, cached: false },
    });

  } catch (error) {
    console.error('Thread analysis error:', error);
    res.status(500).json({ success: false, message: 'Failed to analyse thread' });
  }
};

/**
 * POST /api/thread/:postId/analyse
 * Force re-analysis (ignores cache). Auth required.
 */
export const forceThreadAnalysis = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findOne({ _id: postId, isDeleted: false }).lean();
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const analysis = await threadEvolutionGraph.run(postId, { force: true });

    return res.status(200).json({
      success: true,
      data: { analysis, cached: false },
    });

  } catch (error) {
    console.error('Force thread analysis error:', error);
    res.status(500).json({ success: false, message: 'Failed to analyse thread' });
  }
};