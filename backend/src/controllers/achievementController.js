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
import { asyncHandler } from '../middleware/errorHandler.js';

export const analyseAchievements = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Auth required' });

  const result = await achievementInsightGraph.run(userId);

  res.status(200).json({ success: true, data: result });
});

export const getWeeklyInsight = asyncHandler(async (req, res) => {
  // Identity always comes from the verified token — a caller-supplied userId
  // would expose another user's coaching tips and achievements.
  const userId = req.user?._id || req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Auth required' });

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
});