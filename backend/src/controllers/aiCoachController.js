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

    // Check if getLeaderboard method exists on the model
    let leaderboard;
    if (typeof UserPerformance.getLeaderboard === 'function') {
      leaderboard = await UserPerformance.getLeaderboard(parseInt(limit));
    } else {
      // Fallback if static method doesn't exist
      leaderboard = await UserPerformance.find({ 
        'stats.totalDebates': { $gte: 3 } 
      })
        .populate('user', 'username')
        .sort({ 'stats.winRate': -1 })
        .limit(parseInt(limit));
    }

    res.status(200).json({
      success: true,
      data: {
        leaderboard: leaderboard.map((perf, index) => ({
          rank: index + 1,
          username: perf.user?.username || 'Unknown',
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

    // Check if getTopImprovers method exists on the model
    let improvers;
    if (typeof UserPerformance.getTopImprovers === 'function') {
      improvers = await UserPerformance.getTopImprovers(parseInt(limit));
    } else {
      // Fallback if static method doesn't exist
      improvers = await UserPerformance.find({
        'stats.totalDebates': { $gte: 5 },
        'improvement.velocity': { $in: ['rapid', 'steady'] }
      })
        .populate('user', 'username')
        .sort({ 'improvement.overallGrowth': -1 })
        .limit(parseInt(limit));
    }

    res.status(200).json({
      success: true,
      data: {
        improvers: improvers.map((perf, index) => ({
          rank: index + 1,
          username: perf.user?.username || 'Unknown',
          overallGrowth: perf.improvement?.overallGrowth || 0,
          velocity: perf.improvement?.velocity || 'steady',
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
  } catch (error) {
    console.error('Get comparison error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get comparison data'
    });
  }
};


/**
 * Get category leaders (Tone, Clarity, Evidence, Logic)
 */
export const getCategoryLeaders = async (req, res) => {
  try {
    const { category = 'tone' } = req.query;

    const validCategories = ['tone', 'clarity', 'evidence', 'logic'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Must be: tone, clarity, evidence, or logic'
      });
    }

    const leaders = await UserPerformance.getCategoryLeaders(category, 5);

    res.json({
      success: true,
      data: {
        category,
        leaders: leaders.map((perf, index) => {
          let score;
          if (category === 'tone') score = Math.round(perf.qualityMetrics.avgToneScore);
          else if (category === 'clarity') score = Math.round(perf.qualityMetrics.avgClarityScore);
          else if (category === 'evidence') score = Math.round(perf.qualityMetrics.avgEvidenceScore);
          else score = Math.round((1 - perf.fallacyStats.fallacyRate) * 100);

          return {
            rank: index + 1,
            username: perf.user?.username || 'Unknown',
            score,
            totalDebates: perf.stats.totalDebates
          };
        })
      }
    });

  } catch (error) {
    console.error('Get category leaders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get category leaders'
    });
  }
};

/**
 * Get user's rank position
 */
export const getUserRankPosition = async (req, res) => {
  try {
    const userId = req.query.userId || req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const performance = await UserPerformance.findOne({ user: userId });

    if (!performance) {
      return res.json({
        success: true,
        data: {
          qualified: false,
          message: 'Complete at least 3 debates to qualify for rankings'
        }
      });
    }

    if (performance.stats.totalDebates < 3) {
      return res.json({
        success: true,
        data: {
          qualified: false,
          debatesNeeded: 3 - performance.stats.totalDebates,
          message: `Complete ${3 - performance.stats.totalDebates} more debate(s) to qualify`
        }
      });
    }

    const rankPosition = await UserPerformance.getUserRankPosition(userId);

    res.json({
      success: true,
      data: {
        qualified: true,
        ...rankPosition,
        tier: performance.rank,
        winRate: Math.round(performance.stats.winRate)
      }
    });

  } catch (error) {
    console.error('Get user rank position error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get rank position'
    });
  }
};

/**
 * Get all leaderboards (combined view)
 */
export const getAllLeaderboards = async (req, res) => {
  try {
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

  } catch (error) {
    console.error('Get all leaderboards error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaderboards'
    });
  }
};