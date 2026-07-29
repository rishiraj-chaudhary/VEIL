import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { usageValidators } from '../validators/index.js';
import AIUsage from '../models/AIUsage.js';
import AICostService from '../services/aiCostService.js';

const router = express.Router();

// GET /api/ai-usage/my-stats
router.get('/my-stats', authenticate, validate(usageValidators.range), async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    const userTier = req.user.subscription?.tier || 'free';
    const dailyBudget = AICostService.DAILY_BUDGETS[userTier];

    const budgetStatus = await AIUsage.checkUserBudget(userId, dailyBudget);
    const stats = await AICostService.getUserStats(userId, startDate, endDate);

    res.json({
      success: true,
      data: {
        budget: { daily: dailyBudget, tier: userTier, ...budgetStatus },
        usage: stats
      }
    });
  } catch (error) {
    console.error('Error fetching AI usage stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch usage stats',
      error: error.message
    });
  }
});

// GET /api/ai-usage/daily
router.get('/daily', authenticate, validate(usageValidators.range), async (req, res) => {
  try {
    const userId = req.user._id;
    const { days = 30 } = req.query;

    const dailyUsage = await AIUsage.getDailyUsage(userId, parseInt(days));

    res.json({
      success: true,
      data: dailyUsage
    });
  } catch (error) {
    console.error('Error fetching daily usage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily usage',
      error: error.message
    });
  }
});

// GET /api/ai-usage/operations
router.get('/operations', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    const breakdown = await AIUsage.getOperationBreakdown(userId, startDate, endDate);

    res.json({
      success: true,
      data: breakdown
    });
  } catch (error) {
    console.error('Error fetching operation breakdown:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch operation breakdown',
      error: error.message
    });
  }
});

// GET /api/ai-usage/check-budget
router.get('/check-budget', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const userTier = req.user.subscription?.tier || 'free';

    const { allowed, budget } = await AICostService.canUserMakeRequest(userId, userTier);

    res.json({
      success: true,
      data: { allowed, budget, tier: userTier }
    });
  } catch (error) {
    console.error('Error checking budget:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check budget',
      error: error.message
    });
  }
});


/**
 * GET /api/ai-usage/platform
 *
 * True total spend, including the background work that no single user asked for
 * — graphs, the AI opponent, safety checks. The per-user views below cannot see
 * any of it, which is why the dashboard understated real cost.
 */
router.get('/platform', authenticate, async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - Math.min(365, parseInt(req.query.days, 10) || 30));

    const [totals, byAttribution, byOperation, byModel] = await Promise.all([
      AIUsage.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id: null,
          calls: { $sum: 1 },
          tokens: { $sum: '$totalTokens' },
          cost: { $sum: '$estimatedCost' },
          failures: { $sum: { $cond: [{ $eq: ['$success', false] }, 1, 0] } },
          cached: { $sum: { $cond: ['$cached', 1, 0] } },
        } },
      ]),
      AIUsage.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$attributed', calls: { $sum: 1 }, cost: { $sum: '$estimatedCost' } } },
      ]),
      AIUsage.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$operation', calls: { $sum: 1 }, tokens: { $sum: '$totalTokens' }, cost: { $sum: '$estimatedCost' } } },
        { $sort: { cost: -1 } },
      ]),
      AIUsage.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$model', calls: { $sum: 1 }, cost: { $sum: '$estimatedCost' } } },
        { $sort: { cost: -1 } },
      ]),
    ]);

    const attributed = byAttribution.find(a => a._id === true) || { calls: 0, cost: 0 };
    const system     = byAttribution.find(a => a._id !== true) || { calls: 0, cost: 0 };

    res.json({
      success: true,
      data: {
        periodDays: Math.min(365, parseInt(req.query.days, 10) || 30),
        totals: totals[0] || { calls: 0, tokens: 0, cost: 0, failures: 0, cached: 0 },
        attribution: {
          userDriven: { calls: attributed.calls, cost: attributed.cost },
          background: { calls: system.calls, cost: system.cost },
        },
        byOperation: byOperation.map(o => ({ operation: o._id, calls: o.calls, tokens: o.tokens, cost: o.cost })),
        byModel: byModel.map(m => ({ model: m._id, calls: m.calls, cost: m.cost })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load platform usage' });
  }
});

export default router;