/**
 * ACHIEVEMENT CONTROLLER — Phase 10
 * Place at: backend/src/controllers/achievementController.js
 *
 * Routes:
 *   POST /api/coach/achievements/analyse   — run graph for current user
 *   GET  /api/coach/achievements/weekly    — get weekly highlight + new badges
 */

import UserPerformance from '../models/UserPerformance.js';
import achievementInsightGraph from '../services/graph/achievementInsightGraph.js';

export const analyseAchievements = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Auth required' });

    const result = await achievementInsightGraph.run(userId);

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Achievement analyse error:', error);
    res.status(500).json({ success: false, message: 'Failed to analyse achievements' });
  }
};

export const getWeeklyInsight = async (req, res) => {
  try {
    const userId = req.query.userId || req.user?._id || req.user?.id;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID required' });

    const perf = await UserPerformance.findOne({ user: userId })
      .select('coachingTips achievements')
      .lean();

    if (!perf) return res.status(200).json({ success: true, data: { highlight: null, recentAchievements: [] } });

    // Get weekly highlight from coachingTips
    const highlightTip = perf.coachingTips?.find(t => t.source === 'weeklyHighlight' && !t.dismissed);

    // Get achievements earned in the last 7 days ONLY
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentAchievements = (perf.achievements || []).filter(a => {
      const earned = new Date(a.earnedAt);
      return earned instanceof Date && !isNaN(earned) && earned >= weekAgo;
    });

    res.status(200).json({
      success: true,
      data: {
        highlight:           highlightTip?.actionable || null,
        recentAchievements,
        totalAchievements:   perf.achievements?.length || 0,
      },
    });
  } catch (error) {
    console.error('Weekly insight error:', error);
    res.status(500).json({ success: false, message: 'Failed to get weekly insight' });
  }
};