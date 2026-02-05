import express from 'express';
import * as aiCoachController from '../controllers/aiCoachController.js';

const router = express.Router();

// Temporarily public for testing
router.get('/summary', aiCoachController.getPerformanceSummary);
router.get('/analysis', aiCoachController.getDetailedAnalysis);
router.get('/progress', aiCoachController.getProgressOverTime);
router.get('/tips', aiCoachController.getCoachingTips);
router.post('/tips/:tipId/dismiss', aiCoachController.dismissCoachingTip);
router.get('/achievements', aiCoachController.getAchievements);
router.get('/leaderboard', aiCoachController.getLeaderboard);
router.get('/improvers', aiCoachController.getTopImprovers);
router.get('/comparison', aiCoachController.getComparison);

export default router;