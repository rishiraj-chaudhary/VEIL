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
    getCoachingTips,
    getComparison,
    getDetailedAnalysis,
    getPerformanceSummary,
    getProgressOverTime,
} from '../controllers/aiCoachController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { coachValidators } from '../validators/index.js';

const router = express.Router();

// Performance
router.get('/summary',    authenticate, getPerformanceSummary);
router.get('/analysis',   authenticate, getDetailedAnalysis);
router.get('/progress',   authenticate, validate(coachValidators.progress), getProgressOverTime);
router.get('/tips',       authenticate, getCoachingTips);
router.post('/tips/:tipId/dismiss', authenticate, validate(coachValidators.dismissTip), dismissCoachingTip);
router.get('/comparison', authenticate, getComparison);

// Achievements
router.get('/achievements',         authenticate, getAchievements);
router.post('/achievements/analyse', authenticate, analyseAchievements);
router.get('/achievements/weekly',   authenticate, getWeeklyInsight);

// Leaderboard
router.get('/leaderboard/all',       getAllLeaderboards);

export default router;