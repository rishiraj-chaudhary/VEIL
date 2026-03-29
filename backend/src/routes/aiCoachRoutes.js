/**
 * AI COACH ROUTES — updated for Phase 10
 * Place at: backend/src/routes/aiCoachRoutes.js
 */

import express from 'express';
import { analyseAchievements, getWeeklyInsight } from '../controllers/achievementController.js';
import {
    dismissCoachingTip,
    getAchievements,
    getAllLeaderboards,
    getCategoryLeaders,
    getCoachingTips,
    getComparison,
    getDetailedAnalysis,
    getLeaderboard,
    getPerformanceSummary,
    getProgressOverTime,
    getTopImprovers,
    getUserRankPosition,
} from '../controllers/aiCoachController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Performance
router.get('/summary',    authenticate, getPerformanceSummary);
router.get('/analysis',   authenticate, getDetailedAnalysis);
router.get('/progress',   authenticate, getProgressOverTime);
router.get('/tips',       authenticate, getCoachingTips);
router.post('/tips/:tipId/dismiss', authenticate, dismissCoachingTip);
router.get('/comparison', authenticate, getComparison);

// Achievements
router.get('/achievements',         authenticate, getAchievements);
router.post('/achievements/analyse', authenticate, analyseAchievements);
router.get('/achievements/weekly',   authenticate, getWeeklyInsight);

// Leaderboard
router.get('/leaderboard',           getLeaderboard);
router.get('/leaderboard/top-improvers', getTopImprovers);
router.get('/leaderboard/category',  getCategoryLeaders);
router.get('/leaderboard/all',       getAllLeaderboards);
router.get('/leaderboard/rank',      authenticate, getUserRankPosition);

export default router;