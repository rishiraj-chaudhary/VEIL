import express from 'express';
import { authenticate } from '../middleware/auth.js';
import AIUsage from '../models/AIUsage.js';
import AICostService from '../services/aiCostService.js';

const router = express.Router();

// GET /api/ai-usage/my-stats
router.get('/my-stats', authenticate, async (req, res) => {
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
router.get('/daily', authenticate, async (req, res) => {
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

export default router;