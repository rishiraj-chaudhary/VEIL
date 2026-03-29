import express from 'express';
import {
  createSlick,
  getReceivedSlicks,
  getSentSlicks,
  getSlickInsights,
  getSlickSuggestions,
  getUserCurrency,
  reactToSlick,
  revealSlickAuthor,
} from '../controllers/slickController.js';
import { authenticate } from '../middleware/auth.js';
import perceptionGraph from '../services/graph/perceptionGraph.js';

const router = express.Router();
router.use(authenticate);

router.post('/',              createSlick);
router.get('/received',       getReceivedSlicks);
router.get('/sent',           getSentSlicks);
router.post('/:id/react',     reactToSlick);
router.post('/:id/reveal',    revealSlickAuthor);
router.get('/insights',       getSlickInsights);
router.get('/suggestions/:targetUserId', getSlickSuggestions);
router.get('/currency',       getUserCurrency);

// ── Perception endpoint — returns live data + cached fields ──────────────────
router.get('/perception/:userId', async (req, res) => {
  try {
    const User = (await import('../models/user.js')).default;
    const Slick = (await import('../models/slick.js')).default;

    const user = await User.findById(req.params.userId)
      .select('perceptionTraits perceptionTrend perceptionSummary perceptionUpdatedAt')
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Count ALL slicks received (not just last 30 days) for display
    const slickCount = await Slick.countDocuments({
      targetUser: req.params.userId,
      isActive: true,
      isFlagged: false,
    });

    // If we have cached perception data, return it immediately
    if (user.perceptionTraits) {
      return res.json({
        perceptionTraits: user.perceptionTraits,
        trend:            user.perceptionTrend || 'stable',
        summary:          user.perceptionSummary || '',
        updatedAt:        user.perceptionUpdatedAt || null,
        slickCount,
        coachingInsights: [], // cached — run graph to get fresh insights
      });
    }

    // No cached data — run the graph now with extended lookback (90 days)
    console.log(`🌀 Running perception graph on-demand for user ${req.params.userId}`);
    const result = await perceptionGraph.run(req.params.userId, {
      lookbackDays: 90,  // ← extended from 30 to catch older slicks
      persist: true,
    });

    res.json({
      perceptionTraits: result.perceptionTraits,
      trend:            result.trend,
      summary:          result.summary,
      updatedAt:        result.updatedAt,
      slickCount:       result.slickCount || slickCount,
      coachingInsights: result.coachingInsights || [],
      toneBreakdown:    result.toneBreakdown,
    });

  } catch (error) {
    console.error('Perception endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;