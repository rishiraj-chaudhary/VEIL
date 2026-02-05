import UserPerformance from '../models/UserPerformance.js';
import aiCoachService from '../services/aiCoachService.js';

/**
 * AI COACH CONTROLLER
 * API endpoints for user performance tracking and coaching
 */

/* =====================================================
   GET USER PERFORMANCE SUMMARY
===================================================== */
export const getPerformanceSummary = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

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
  } catch (error) {
    console.error('Get performance summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get performance summary'
    });
  }
};

/* =====================================================
   GET DETAILED ANALYSIS
===================================================== */
export const getDetailedAnalysis = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    const analysis = await aiCoachService.analyzePerformance(userId);

    res.status(200).json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Get detailed analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get detailed analysis'
    });
  }
};

/* =====================================================
   GET PROGRESS OVER TIME
===================================================== */
export const getProgressOverTime = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { period = 'all' } = req.query; // 'week', 'month', 'all'

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
  } catch (error) {
    console.error('Get progress over time error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get progress data'
    });
  }
};

/* =====================================================
   GET COACHING TIPS
===================================================== */
export const getCoachingTips = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

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
  } catch (error) {
    console.error('Get coaching tips error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get coaching tips'
    });
  }
};

/* =====================================================
   DISMISS COACHING TIP
===================================================== */
export const dismissCoachingTip = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { tipId } = req.params;

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
  } catch (error) {
    console.error('Dismiss coaching tip error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to dismiss tip'
    });
  }
};

/* =====================================================
   GET ACHIEVEMENTS
===================================================== */
export const getAchievements = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

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
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get achievements'
    });
  }
};

/* =====================================================
   GET LEADERBOARD
===================================================== */
export const getLeaderboard = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const leaderboard = await UserPerformance.getLeaderboard(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        leaderboard: leaderboard.map((perf, index) => ({
          rank: index + 1,
          username: perf.user.username,
          winRate: Math.round(perf.stats.winRate),
          totalDebates: perf.stats.totalDebates,
          wins: perf.stats.wins,
          tier: perf.rank
        }))
      }
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaderboard'
    });
  }
};

/* =====================================================
   GET TOP IMPROVERS
===================================================== */
export const getTopImprovers = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const improvers = await UserPerformance.getTopImprovers(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        improvers: improvers.map((perf, index) => ({
          rank: index + 1,
          username: perf.user.username,
          overallGrowth: perf.improvement.overallGrowth,
          velocity: perf.improvement.velocity,
          totalDebates: perf.stats.totalDebates
        }))
      }
    });
  } catch (error) {
    console.error('Get top improvers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get top improvers'
    });
  }
};

/* =====================================================
   GET COMPARISON WITH AVERAGE
===================================================== */
export const getComparison = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

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
  } catch (error) {
    console.error('Get comparison error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get comparison data'
    });
  }
};