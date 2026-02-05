import express from 'express';
import * as knowledgeGraphController from '../controllers/knowledgeGraphController.js';

const router = express.Router();

/**
 * KNOWLEDGE GRAPH ROUTES
 * 
 * All routes for querying the argument knowledge graph
 * Temporarily public for testing
 */

// Get statistics for a specific claim
router.post('/claims/stats', knowledgeGraphController.getClaimStats);

// Get popular claims
router.get('/claims/popular', knowledgeGraphController.getPopularClaims);

// Get most successful claims
router.get('/claims/successful', knowledgeGraphController.getMostSuccessful);

// Search claims
router.get('/claims/search', knowledgeGraphController.searchClaims);

// Get claims by topic
router.get('/claims/topic/:topic', knowledgeGraphController.getClaimsByTopic);

// Get claim relationships
router.get('/claims/:claimId/relationships', knowledgeGraphController.getClaimRelationships);

// Get overall graph statistics
router.get('/stats', knowledgeGraphController.getGraphStats);

export default router;