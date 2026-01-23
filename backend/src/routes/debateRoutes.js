import express from 'express';
import {
    cancelDebate,
    createDebate,
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
    deleteReaction,
    getDebateReactions,
    getDebateVotes,
    getRoundVotes,
    getTurnReactions,
    reactToTurn,
    voteOnRound,
} from '../controllers/debateVoteController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/* =====================================================
   DEBATE ROUTES
===================================================== */

// Public routes
router.get('/', getDebates); // Get all debates (with filters)
router.get('/:id', getDebate); // Get single debate

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
router.get('/turns/:turnId/reactions', getTurnReactions); // Get turn reactions
router.get('/:debateId/reactions', getDebateReactions); // Get debate reactions

// Protected routes
router.post('/:debateId/votes/:round', authenticate, voteOnRound); // Vote on round
router.post('/turns/:turnId/reactions', authenticate, reactToTurn); // React to turn
router.delete('/reactions/:reactionId', authenticate, deleteReaction); // Delete reaction

export default router;