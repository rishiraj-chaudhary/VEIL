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
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { debateValidators, postValidators, turnValidators } from '../validators/index.js';

const router = express.Router();

/* =====================================================
   DEBATE ROUTES
===================================================== */

// NOTE: an inline `GET /:debateId/score` used to be declared here, above
// everything else. Because Express matches in registration order and both
// patterns capture the same shape, it shadowed the real `GET /:id/score` below
// and `getDebateScore` was unreachable. The two also behaved differently: this
// one called calculateFinalScore unconditionally — recomputing scores, rewriting
// performance records and issuing an LLM call on every page load — and threw a
// 500 for any debate that was not yet complete, while the controller reads the
// stored score and only computes when none exists. The controller version is the
// one that survives; see the single registration further down.

// Public replay — no authentication, so a finished debate can be shared.
router.get('/public/:id', validate(postValidators.byId), getPublicDebate);

// AI opponent — declared before '/:id' so 'ai' is not captured as an id
router.get('/ai/profiles', getAIOpponentProfiles);
router.post('/ai', authenticate, validate(debateValidators.createVsAI), createAIDebate);

// Public routes.
//
// `getDebates` reads req.user._id when called with ?myDebates=true, so it needs
// the user attached when a token is present. `optionalAuthenticate` populates
// req.user if the request carries a valid token and simply continues if not,
// which keeps the listing public while making "my debates" work.
router.get('/', optionalAuthenticate, validate(debateValidators.list), getDebates);
router.get('/:id', validate(postValidators.byId), getDebate); // Get single debate
// Live assistant — an LLM call per request, so it is authenticated and bounded.
router.post('/:debateId/live-insights', authenticate, validate(debateValidators.liveInsights), getLiveInsights);

// Protected routes
router.post('/', authenticate, validate(debateValidators.create), createDebate); // Create debate
router.post('/:id/join', authenticate, validate(debateValidators.join), joinDebate); // Join debate
router.post('/:id/ready', authenticate, validate(postValidators.byId), markReady); // Mark ready
router.post('/:id/leave', authenticate, validate(postValidators.byId), leaveDebate); // Leave debate
router.post('/:id/cancel', authenticate, validate(postValidators.byId), cancelDebate); // Cancel debate
router.get('/:id/stats', authenticate, validate(postValidators.byId), getDebateStats); // Get statistics
router.get('/:id/score', validate(postValidators.byId), getDebateScore); // Get final score

/* =====================================================
   TURN ROUTES
===================================================== */

// '/turns/:turnId' is declared first: it is two segments where the others are
// three, but keeping the literal-prefixed route ahead of the parameterised ones
// makes the ordering constraint obvious rather than incidental.
router.get('/turns/:turnId', validate(turnValidators.byId), getTurn); // Get single turn

// Public routes
router.get('/:debateId/turns', validate(turnValidators.byDebate), getDebateTurns); // Get all turns
router.get('/:debateId/turns/rounds', validate(turnValidators.byRound), getTurnsByRound); // Get turns by round

// Protected routes
router.get('/:debateId/turns/check', authenticate, validate(turnValidators.byDebate), canSubmitTurn); // Check eligibility
router.post('/:debateId/turns', authenticate, validate(debateValidators.submitTurn), submitTurn); // Submit turn

/* =====================================================
   VOTING & REACTION ROUTES
===================================================== */

// Public routes
router.get('/:debateId/votes', validate(turnValidators.byDebate), getDebateVotes); // Get all votes
router.get('/:debateId/votes/:round', validate(turnValidators.byRoundParam), getRoundVotes); // Get round votes

// Protected routes
router.post('/:debateId/votes/:round', authenticate, validate(debateValidators.vote), voteOnRound); // Vote on round

export default router;