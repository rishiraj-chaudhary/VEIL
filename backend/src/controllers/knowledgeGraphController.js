import knowledgeGraphService from '../services/knowledgeGraphService.js';

/**
 * KNOWLEDGE GRAPH CONTROLLER
 * API endpoints for querying the argument knowledge graph
 */

/* =====================================================
   GET CLAIM STATISTICS
===================================================== */
export const getClaimStats = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get claim stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get claim statistics'
    });
  }
};

/* =====================================================
   GET POPULAR CLAIMS
===================================================== */
export const getPopularClaims = async (req, res) => {
  try {
    const { topic, limit } = req.query;

    const claims = await knowledgeGraphService.getPopularClaims(
      topic || null,
      parseInt(limit) || 10
    );

    res.status(200).json({
      success: true,
      data: { claims }
    });
  } catch (error) {
    console.error('Get popular claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get popular claims'
    });
  }
};

/* =====================================================
   GET MOST SUCCESSFUL CLAIMS
===================================================== */
export const getMostSuccessful = async (req, res) => {
  try {
    const { topic, limit } = req.query;

    const claims = await knowledgeGraphService.getMostSuccessful(
      topic || null,
      parseInt(limit) || 10
    );

    res.status(200).json({
      success: true,
      data: { claims }
    });
  } catch (error) {
    console.error('Get successful claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get successful claims'
    });
  }
};

/* =====================================================
   SEARCH CLAIMS
===================================================== */
export const searchClaims = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Search claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search claims'
    });
  }
};

/* =====================================================
   GET GRAPH STATISTICS
===================================================== */
export const getGraphStats = async (req, res) => {
  try {
    const stats = await knowledgeGraphService.getGraphStats();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get graph stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get graph statistics'
    });
  }
};

/* =====================================================
   GET CLAIM RELATIONSHIPS
===================================================== */
export const getClaimRelationships = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get claim relationships error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get claim relationships'
    });
  }
};

/* =====================================================
   GET CLAIMS BY TOPIC
===================================================== */
export const getClaimsByTopic = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get claims by topic error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get claims by topic'
    });
  }
};