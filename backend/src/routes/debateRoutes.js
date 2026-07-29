import express from 'express';
import { getLiveInsights } from '../controllers/assistantController.js';
import {
    cancelDebate,
    createAIDebate,
    createDebate,
    getAIOpponentProfiles,
    getDebate,
    getDebates,
    getDebateScore,
    getDebateStats,
    joinDebate,
    leaveDebate,
    markReady,
} from '../controllers/debateController.js';
import {
    canSubmitTurn,
    getDebateTurns,
    getTurn,
    getTurnsByRound,
    submitTurn,
} from '../controllers/debateTurnController.js';
import {
    getDebateVotes,
    getRoundVotes,
    voteOnRound,
} from '../controllers/debateVoteController.js';
import { getPublicDebate } from '../controllers/publicDebateController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import debateScoringService from '../services/debateScoringService.js';
import { debateValidators, postValidators } from '../validators/index.js';

const router = express.Router();

/* =====================================================
   DEBATE ROUTES
===================================================== */
router.get('/:debateId/score', async (req, res) => {
    try {
      const { debateId } = req.params;
      
      console.log('📊 Fetching detailed score for debate:', debateId);
      
      const score = await debateScoringService.calculateFinalScore(debateId);
      
      res.json({
        success: true,
        data: score
      });
      
    } catch (error) {
      console.error('❌ Get score error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });
  
// Public replay — no authentication, so a finished debate can be shared.
router.get('/public/:id', validate(postValidators.byId), getPublicDebate);

// AI opponent — declared before '/:id' so 'ai' is not captured as an id
router.get('/ai/profiles', getAIOpponentProfiles);
router.post('/ai', authenticate, validate(debateValidators.createVsAI), createAIDebate);

// Public routes
router.get('/', getDebates); // Get all debates (with filters)
router.get('/:id', getDebate); // Get single debate
// Live assistant
router.post('/:debateId/live-insights', authenticate, getLiveInsights);

// Protected routes
router.post('/', authenticate, createDebate); // Create debate
router.post('/:id/join', authenticate, joinDebate); // Join debate
router.post('/:id/ready', authenticate, markReady); // Mark ready
router.post('/:id/leave', authenticate, leaveDebate); // Leave debate
router.post('/:id/cancel', authenticate, cancelDebate); // Cancel debate
router.get('/:id/stats', authenticate, getDebateStats); // Get statistics
router.get('/:id/score', getDebateScore); // Get final score

/* =====================================================
   TURN ROUTES
===================================================== */

// Public routes
router.get('/:debateId/turns', getDebateTurns); // Get all turns
router.get('/:debateId/turns/rounds', getTurnsByRound); // Get turns by round
router.get('/turns/:turnId', getTurn); // Get single turn

// Protected routes
router.post('/:debateId/turns', authenticate, submitTurn); // Submit turn
router.get('/:debateId/turns/check', authenticate, canSubmitTurn); // Check eligibility

/* =====================================================
   VOTING & REACTION ROUTES
===================================================== */

// Public routes
router.get('/:debateId/votes', getDebateVotes); // Get all votes
router.get('/:debateId/votes/:round', getRoundVotes); // Get round votes

// Protected routes
router.post('/:debateId/votes/:round', authenticate, voteOnRound); // Vote on round

export default router;