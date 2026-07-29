import express from 'express';
import * as knowledgeGraphController from '../controllers/knowledgeGraphController.js';
import { validate } from '../middleware/validate.js';
import { knowledgeGraphValidators } from '../validators/index.js';

const router = express.Router();

/**
 * KNOWLEDGE GRAPH ROUTES
 * 
 * All routes for querying the argument knowledge graph
 * Temporarily public for testing
 */

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