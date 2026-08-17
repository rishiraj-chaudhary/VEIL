import UserPerformance from '../models/UserPerformance.js';
import aiCoachService from '../services/aiCoachService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * AI COACH CONTROLLER
 * API endpoints for user performance tracking and coaching
 */

/**
 * Whose coaching data this request is for.
 *
 * Every handler here used to resolve `req.query.userId || req.params.userId ||
 * req.user._id`, in that order — a caller-supplied id took priority over the
 * verified one. Since all of these routes are authenticated, that did not open
 * them to anonymous users; it did let any logged-in user read any other user's
 * performance summary, blind-spot analysis, coaching tips, achievements and
 * peer comparison by appending `?userId=<their id>`.
 *
 * This is private coaching material — it is written to the user about their own
 * weaknesses. Identity comes from the token and nowhere else.
 */
const subjectOf = req => req.user?._id || req.user?.id || null;

/* =====================================================
   GET USER PERFORMANCE SUMMARY
===================================================== */
export const getPerformanceSummary = asyncHandler(async (req, res) => {
  const userId = subjectOf(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
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
  const userId = subjectOf(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
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
  const userId = subjectOf(req);
  const { period = 'all' } = req.query; // 'week', 'month', 'all'

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
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
  const userId = subjectOf(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
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
  const userId = subjectOf(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
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
  const userId = subjectOf(req);

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

  // Platform averages, computed in the database.
  //
  // This used to load every qualifying UserPerformance document into memory and
  // sum them in a loop. Each of those documents carries up to 52 snapshots, 15
  // coaching tips and a full achievement list, so the request grew with the size
  // of the platform and transferred megabytes to add up five numbers.
  const [platform] = await UserPerformance.aggregate([
    { $match: { 'stats.totalDebates': { $gte: 3 } } },
    {
      $group: {
        _id: null,
        avgToneScore:     { $avg: '$qualityMetrics.avgToneScore' },
        avgClarityScore:  { $avg: '$qualityMetrics.avgClarityScore' },
        avgEvidenceScore: { $avg: '$qualityMetrics.avgEvidenceScore' },
        fallacyRate:      { $avg: '$fallacyStats.fallacyRate' },
        winRate:          { $avg: '$stats.winRate' },
      },
    },
  ]);

  const avgMetrics = {
    avgToneScore:     platform?.avgToneScore     || 0,
    avgClarityScore:  platform?.avgClarityScore  || 0,
    avgEvidenceScore: platform?.avgEvidenceScore || 0,
    fallacyRate:      platform?.fallacyRate      || 0,
    winRate:          platform?.winRate          || 0,
  };

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