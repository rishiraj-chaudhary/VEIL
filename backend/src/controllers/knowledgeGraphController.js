import knowledgeGraphService from '../services/knowledgeGraphService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * KNOWLEDGE GRAPH CONTROLLER
 * API endpoints for querying the argument knowledge graph
 */

/* =====================================================
   GET CLAIM STATISTICS
===================================================== */
export const getClaimStats = asyncHandler(async (req, res) => {
  const { claimText } = req.body;

  if (!claimText) {
    return res.status(400).json({
      success: false,
      message: 'Claim text required'
    });
  }

  const stats = await knowledgeGraphService.getClaimStats(claimText);

  if (!stats) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found in knowledge graph'
    });
  }

  res.status(200).json({
    success: true,
    data: stats
  });
});

/* =====================================================
   GET POPULAR CLAIMS
===================================================== */
export const getPopularClaims = asyncHandler(async (req, res) => {
  const { topic, limit } = req.query;

  const claims = await knowledgeGraphService.getPopularClaims(
    topic || null,
    parseInt(limit) || 10
  );

  res.status(200).json({
    success: true,
    data: { claims }
  });
});

/* =====================================================
   GET MOST SUCCESSFUL CLAIMS
===================================================== */
export const getMostSuccessful = asyncHandler(async (req, res) => {
  const { topic, limit } = req.query;

  const claims = await knowledgeGraphService.getMostSuccessful(
    topic || null,
    parseInt(limit) || 10
  );

  res.status(200).json({
    success: true,
    data: { claims }
  });
});

/* =====================================================
   SEARCH CLAIMS
===================================================== */
export const searchClaims = asyncHandler(async (req, res) => {
  const { query, limit } = req.query;

  if (!query) {
    return res.status(400).json({
      success: false,
      message: 'Search query required'
    });
  }

  const results = await knowledgeGraphService.searchClaims(
    query,
    parseInt(limit) || 10
  );

  res.status(200).json({
    success: true,
    data: { results }
  });
});

/* =====================================================
   GET GRAPH STATISTICS
===================================================== */
export const getGraphStats = asyncHandler(async (req, res) => {
  const stats = await knowledgeGraphService.getGraphStats();

  res.status(200).json({
    success: true,
    data: stats
  });
});

/* =====================================================
   GET CLAIM RELATIONSHIPS
===================================================== */
export const getClaimRelationships = asyncHandler(async (req, res) => {
  const { claimId } = req.params;

  const Claim = (await import('../models/Claim.js')).default;
  
  const claim = await Claim.findById(claimId)
    .populate('relatedClaims.claim', 'originalText topic stats')
    .populate('counterClaims.claim', 'originalText topic stats')
    .populate('debates.debate', 'topic')
    .populate('debates.turn', 'content author');

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found'
    });
  }

  res.status(200).json({
    success: true,
    data: {
      claim: {
        id: claim._id,
        text: claim.originalText,
        topic: claim.topic,
        stats: claim.stats
      },
      relatedClaims: claim.relatedClaims,
      counterClaims: claim.counterClaims,
      debates: claim.debates
    }
  });
});

/* =====================================================
   GET CLAIMS BY TOPIC
===================================================== */
export const getClaimsByTopic = asyncHandler(async (req, res) => {
  const { topic } = req.params;
  const { limit, sort } = req.query;

  const Claim = (await import('../models/Claim.js')).default;

  let sortCriteria = {};
  if (sort === 'popular') {
    sortCriteria = { 'stats.totalUses': -1 };
  } else if (sort === 'successful') {
    sortCriteria = { 'stats.successRate': -1 };
  } else if (sort === 'recent') {
    sortCriteria = { createdAt: -1 };
  }

  const claims = await Claim.find({ topic })
    .sort(sortCriteria)
    .limit(parseInt(limit) || 20)
    .select('originalText stats createdAt');

  res.status(200).json({
    success: true,
    data: { 
      topic,
      count: claims.length,
      claims 
    }
  });
});