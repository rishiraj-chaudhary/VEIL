import express from 'express';
import * as knowledgeGraphController from '../controllers/knowledgeGraphController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { knowledgeGraphValidators } from '../validators/index.js';

const router = express.Router();

/**
 * KNOWLEDGE GRAPH ROUTES
 *
 * Queries over the argument claim graph.
 *
 * These were marked "temporarily public for testing" and shipped that way. The
 * graph holds every claim every user has advanced, attributed to them by id,
 * along with how each one fared — so the search and topic endpoints amounted to
 * an unauthenticated dump of the platform's argument history, and
 * `claims/stats` embeds the caller's text and runs a semantic search per call.
 */
router.use(authenticate);

// Get statistics for a specific claim
router.post('/claims/stats', validate(knowledgeGraphValidators.claimStats), knowledgeGraphController.getClaimStats);

// Get popular claims
router.get('/claims/popular', knowledgeGraphController.getPopularClaims);

// Get most successful claims
router.get('/claims/successful', knowledgeGraphController.getMostSuccessful);

// Search claims
router.get('/claims/search', validate(knowledgeGraphValidators.search), knowledgeGraphController.searchClaims);

// Get claims by topic
router.get('/claims/topic/:topic', validate(knowledgeGraphValidators.byTopic), knowledgeGraphController.getClaimsByTopic);

// Get claim relationships
router.get('/claims/:claimId/relationships', validate(knowledgeGraphValidators.byClaim), knowledgeGraphController.getClaimRelationships);

// Get overall graph statistics
router.get('/stats', knowledgeGraphController.getGraphStats);

export default router;