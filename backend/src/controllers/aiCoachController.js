import UserPerformance from '../models/UserPerformance.js';
import aiCoachService from '../services/aiCoachService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * AI COACH CONTROLLER
 * API endpoints for user performance tracking and coaching
 */

/* =====================================================
   GET USER PERFORMANCE SUMMARY
===================================================== */
export const getPerformanceSummary = asyncHandler(async (req, res) => {
  // ✅ FIX: Check query params FIRST, then authenticated user
  const userId = req.query.userId || req.params.userId || req.user?._id || req.user?.id;

  console.log('🔍 DEBUG Controller: Query userId:', req.query.userId);
  console.log('🔍 DEBUG Controller: Params userId:', req.params.userId);
  console.log('🔍 DEBUG Controller: Auth user:', req.user?._id || req.user?.id);
  console.log('🔍 DEBUG Controller: Final userId:', userId);

  if (!userId) {
    console.log('❌ No userId provided');
    return res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
  }

  const summary = await aiCoachService.getPerformanceSummary(userId);

  if (!summary) {
    return res.status(200).json({
      success: true,
      data: {
        hasData: false,
        message: 'Start debating to track your progress!'
      }
    });
  }

  res.status(200).json({
    success: true,
    data: summary
  });
});

/* =====================================================
   GET DETAILED ANALYSIS
===================================================== */
export const getDetailedAnalysis = asyncHandler(async (req, res) => {
  const userId = req.query.userId || req.params.userId || req.user?._id || req.user?.id;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
  }

  const analysis = await aiCoachService.analyzePerformance(userId);

  res.status(200).json({
    success: true,
    data: analysis
  });
});

/* =====================================================
   GET PROGRESS OVER TIME
===================================================== */
export const getProgressOverTime = asyncHandler(async (req, res) => {
  const userId = req.query.userId || req.params.userId || req.user?._id || req.user?.id;
  const { period = 'all' } = req.query; // 'week', 'month', 'all'

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
  }

  const performance = await UserPerformance.findOne({ user: userId });

  if (!performance || performance.snapshots.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        hasData: false,
        snapshots: []
      }
    });
  }

  let snapshots = performance.snapshots;

  // Filter by period if needed
  if (period === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    snapshots = snapshots.filter(s => s.date >= weekAgo);
  } else if (period === 'month') {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    snapshots = snapshots.filter(s => s.date >= monthAgo);
  }

  res.status(200).json({
    success: true,
    data: {
      hasData: true,
      snapshots: snapshots.sort((a, b) => a.date - b.date),
      currentMetrics: {
        avgToneScore: performance.qualityMetrics.avgToneScore,
        avgClarityScore: performance.qualityMetrics.avgClarityScore,
        avgEvidenceScore: performance.qualityMetrics.avgEvidenceScore,
        fallacyRate: performance.fallacyStats.fallacyRate,
        winRate: performance.stats.winRate
      }
    }
  });
});

/* =====================================================
   GET COACHING TIPS
===================================================== */
export const getCoachingTips = asyncHandler(async (req, res) => {
  const userId = req.query.userId || req.params.userId || req.user?._id || req.user?.id;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
  }

  const performance = await UserPerformance.findOne({ user: userId });

  if (!performance) {
    return res.status(200).json({
      success: true,
      data: { tips: [] }
    });
  }

  const activeTips = performance.coachingTips.filter(t => !t.dismissed);

  res.status(200).json({
    success: true,
    data: {
      tips: activeTips.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
    }
  });
});

/* =====================================================
   DISMISS COACHING TIP
===================================================== */
export const dismissCoachingTip = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const { tipId } = req.params;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const performance = await UserPerformance.findOne({ user: userId });

  if (!performance) {
    return res.status(404).json({
      success: false,
      message: 'Performance data not found'
    });
  }

  const tip = performance.coachingTips.id(tipId);
  if (tip) {
    tip.dismissed = true;
    await performance.save();
  }

  res.status(200).json({
    success: true,
    message: 'Tip dismissed'
  });
});

/* =====================================================
   GET ACHIEVEMENTS
===================================================== */
export const getAchievements = asyncHandler(async (req, res) => {
  const userId = req.query.userId || req.params.userId || req.user?._id || req.user?.id;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
  }

  const performance = await UserPerformance.findOne({ user: userId });

  if (!performance) {
    return res.status(200).json({
      success: true,
      data: { achievements: [] }
    });
  }

  res.status(200).json({
    success: true,
    data: {
      achievements: performance.achievements.sort((a, b) => b.earnedAt - a.earnedAt),
      totalAchievements: performance.achievements.length
    }
  });
});

/* =====================================================
   GET LEADERBOARD
===================================================== */
/* =====================================================
   GET TOP IMPROVERS
===================================================== */
/* =====================================================
   GET COMPARISON WITH AVERAGE
===================================================== */
export const getComparison = asyncHandler(async (req, res) => {
  const userId = req.query.userId || req.params.userId || req.user?._id || req.user?.id;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
  }

  const performance = await UserPerformance.findOne({ user: userId });

  if (!performance) {
    return res.status(404).json({
      success: false,
      message: 'Performance data not found'
    });
  }

  // Calculate platform averages
  const allPerformances = await UserPerformance.find({
    'stats.totalDebates': { $gte: 3 }
  });

  const avgMetrics = {
    avgToneScore: 0,
    avgClarityScore: 0,
    avgEvidenceScore: 0,
    fallacyRate: 0,
    winRate: 0
  };

  if (allPerformances.length > 0) {
    allPerformances.forEach(p => {
      avgMetrics.avgToneScore += p.qualityMetrics.avgToneScore;
      avgMetrics.avgClarityScore += p.qualityMetrics.avgClarityScore;
      avgMetrics.avgEvidenceScore += p.qualityMetrics.avgEvidenceScore;
      avgMetrics.fallacyRate += p.fallacyStats.fallacyRate;
      avgMetrics.winRate += p.stats.winRate;
    });

    Object.keys(avgMetrics).forEach(key => {
      avgMetrics[key] = avgMetrics[key] / allPerformances.length;
    });
  }

  res.status(200).json({
    success: true,
    data: {
      userMetrics: {
        avgToneScore: performance.qualityMetrics.avgToneScore,
        avgClarityScore: performance.qualityMetrics.avgClarityScore,
        avgEvidenceScore: performance.qualityMetrics.avgEvidenceScore,
        fallacyRate: performance.fallacyStats.fallacyRate,
        winRate: performance.stats.winRate
      },
      platformAverage: avgMetrics,
      comparison: {
        toneVsAvg: Math.round(performance.qualityMetrics.avgToneScore - avgMetrics.avgToneScore),
        clarityVsAvg: Math.round(performance.qualityMetrics.avgClarityScore - avgMetrics.avgClarityScore),
        evidenceVsAvg: Math.round(performance.qualityMetrics.avgEvidenceScore - avgMetrics.avgEvidenceScore),
        fallacyVsAvg: Math.round((avgMetrics.fallacyRate - performance.fallacyStats.fallacyRate) * 100),
        winRateVsAvg: Math.round(performance.stats.winRate - avgMetrics.winRate)
      }
    }
  });
});


/**
 * Get category leaders (Tone, Clarity, Evidence, Logic)
 */
/**
 * Get user's rank position
 */
/**
 * Get all leaderboards (combined view)
 */
export const getAllLeaderboards = asyncHandler(async (req, res) => {
  const [overall, improvers, tone, clarity, evidence, logic] = await Promise.all([
    UserPerformance.getLeaderboard(10, 'winRate'),
    UserPerformance.getTopImprovers(10),
    UserPerformance.getCategoryLeaders('tone', 5),
    UserPerformance.getCategoryLeaders('clarity', 5),
    UserPerformance.getCategoryLeaders('evidence', 5),
    UserPerformance.getCategoryLeaders('logic', 5)
  ]);

  res.json({
    success: true,
    data: {
      overall: overall.map((p, i) => ({
        rank: i + 1,
        username: p.user?.username,
        winRate: Math.round(p.stats.winRate),
        totalDebates: p.stats.totalDebates,
        tier: p.rank
      })),
      improvers: improvers.map((p, i) => ({
        rank: i + 1,
        username: p.user?.username,
        growth: p.improvement.overallGrowth,
        velocity: p.improvement.velocity
      })),
      categoryLeaders: {
        tone: tone.map((p, i) => ({
          rank: i + 1,
          username: p.user?.username,
          score: Math.round(p.qualityMetrics.avgToneScore)
        })),
        clarity: clarity.map((p, i) => ({
          rank: i + 1,
          username: p.user?.username,
          score: Math.round(p.qualityMetrics.avgClarityScore)
        })),
        evidence: evidence.map((p, i) => ({
          rank: i + 1,
          username: p.user?.username,
          score: Math.round(p.qualityMetrics.avgEvidenceScore)
        })),
        logic: logic.map((p, i) => ({
          rank: i + 1,
          username: p.user?.username,
          score: Math.round((1 - p.fallacyStats.fallacyRate) * 100)
        }))
      }
    }
  });
});