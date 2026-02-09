import PersonaSnapshot from '../models/PersonaSnapshot.js';
import { personaDriftService } from '../services/personaDriftService.js';

// ============================================
// CREATE SNAPSHOT
// ============================================

/**
 * Manually create a persona snapshot
 * POST /api/persona/snapshot
 */
export const createSnapshot = async (req, res) => {
  try {
    const userId = req.user.id;
    const { periodDays = 30 } = req.body;

    const snapshot = await personaDriftService.createSnapshot(userId, {
      snapshotType: 'manual',
      trigger: 'user_request',
      periodDays: parseInt(periodDays)
    });

    res.status(201).json({
      success: true,
      message: 'Persona snapshot created',
      snapshot: {
        id: snapshot._id,
        timestamp: snapshot.timestamp,
        traits: snapshot.traits,
        topics: snapshot.topics,
        metrics: snapshot.metrics,
        summary: snapshot.summary,
        driftScore: snapshot.driftAnalysis?.overallDriftScore || 0
      }
    });

  } catch (error) {
    console.error('Error creating snapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create persona snapshot',
      error: error.message
    });
  }
};

// ============================================
// GET DRIFT TIMELINE
// ============================================

/**
 * Get drift timeline for current user
 * GET /api/persona/drift/timeline
 */
export const getDriftTimeline = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    const timeline = await personaDriftService.getDriftTimeline(
      userId,
      parseInt(limit)
    );

    res.json({
      success: true,
      timeline
    });

  } catch (error) {
    console.error('Error getting drift timeline:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get drift timeline',
      error: error.message
    });
  }
};

// ============================================
// GET LATEST SNAPSHOT
// ============================================

/**
 * Get latest persona snapshot for user
 * GET /api/persona/snapshot/latest
 */
export const getLatestSnapshot = async (req, res) => {
  try {
    const userId = req.user.id;

    const snapshot = await PersonaSnapshot.getLatest(userId);

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: 'No persona snapshot found. Create one first!'
      });
    }

    res.json({
      success: true,
      snapshot: {
        id: snapshot._id,
        timestamp: snapshot.timestamp,
        traits: snapshot.traits,
        topics: snapshot.topics,
        metrics: snapshot.metrics,
        summary: snapshot.summary,
        keyChanges: snapshot.keyChanges,
        driftAnalysis: snapshot.driftAnalysis,
        snapshotType: snapshot.snapshotType,
        periodCovered: snapshot.periodCovered
      }
    });

  } catch (error) {
    console.error('Error getting latest snapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get latest snapshot',
      error: error.message
    });
  }
};

// ============================================
// GET SNAPSHOT HISTORY
// ============================================

/**
 * Get all snapshots for user
 * GET /api/persona/snapshots
 */
export const getSnapshots = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, includeEmbedding = false } = req.query;

    const query = PersonaSnapshot.find({ userId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    // Exclude large embedding array unless requested
    if (includeEmbedding !== 'true') {
      query.select('-embedding');
    }

    const snapshots = await query.lean();

    res.json({
      success: true,
      count: snapshots.length,
      snapshots: snapshots.map(s => ({
        id: s._id,
        timestamp: s.timestamp,
        traits: s.traits,
        topics: s.topics,
        metrics: s.metrics,
        summary: s.summary,
        driftScore: s.driftAnalysis?.overallDriftScore || 0,
        snapshotType: s.snapshotType,
        trigger: s.trigger
      }))
    });

  } catch (error) {
    console.error('Error getting snapshots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get snapshots',
      error: error.message
    });
  }
};

// ============================================
// GET SPECIFIC SNAPSHOT
// ============================================

/**
 * Get a specific snapshot by ID
 * GET /api/persona/snapshot/:id
 */
export const getSnapshot = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const snapshot = await PersonaSnapshot.findOne({
      _id: id,
      userId // Ensure user owns this snapshot
    }).select('-embedding');

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: 'Snapshot not found'
      });
    }

    res.json({
      success: true,
      snapshot
    });

  } catch (error) {
    console.error('Error getting snapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get snapshot',
      error: error.message
    });
  }
};

// ============================================
// GET EVOLUTION STATS
// ============================================

/**
 * Get persona evolution statistics
 * GET /api/persona/evolution
 */
export const getEvolutionStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await personaDriftService.getEvolutionStats(userId);

    res.json({
      success: true,
      evolution: stats
    });

  } catch (error) {
    console.error('Error getting evolution stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get evolution stats',
      error: error.message
    });
  }
};

// ============================================
// GET SIGNIFICANT DRIFTS
// ============================================

/**
 * Get significant drift events
 * GET /api/persona/drift/significant
 */
export const getSignificantDrifts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { threshold = 50 } = req.query;

    const drifts = await PersonaSnapshot.getSignificantDrifts(
      userId,
      parseInt(threshold)
    );

    res.json({
      success: true,
      count: drifts.length,
      drifts: drifts.map(d => ({
        id: d._id,
        timestamp: d.timestamp,
        driftScore: d.driftAnalysis?.overallDriftScore,
        summary: d.summary,
        significantChanges: d.driftAnalysis?.significantChanges || []
      }))
    });

  } catch (error) {
    console.error('Error getting significant drifts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get significant drifts',
      error: error.message
    });
  }
};

// ============================================
// COMPARE TWO SNAPSHOTS
// ============================================

/**
 * Compare two snapshots
 * GET /api/persona/compare/:id1/:id2
 */
export const compareSnapshots = async (req, res) => {
  try {
    const { id1, id2 } = req.params;
    const userId = req.user.id;

    const [snapshot1, snapshot2] = await Promise.all([
      PersonaSnapshot.findOne({ _id: id1, userId }),
      PersonaSnapshot.findOne({ _id: id2, userId })
    ]);

    if (!snapshot1 || !snapshot2) {
      return res.status(404).json({
        success: false,
        message: 'One or both snapshots not found'
      });
    }

    // Calculate differences
    const traitDifferences = {};
    const numericTraits = ['vocabularyComplexity', 'aggressiveness', 'empathy', 'formality', 'humor'];

    numericTraits.forEach(trait => {
      const val1 = snapshot1.traits[trait] || 50;
      const val2 = snapshot2.traits[trait] || 50;
      traitDifferences[trait] = {
        snapshot1: val1,
        snapshot2: val2,
        difference: val2 - val1,
        percentChange: val1 === 0 ? 0 : Math.round(((val2 - val1) / val1) * 100)
      };
    });

    // Calculate embedding similarity
    const similarity = snapshot1.cosineSimilarity?.(
      snapshot1.embedding,
      snapshot2.embedding
    ) || 0;

    res.json({
      success: true,
      comparison: {
        snapshot1: {
          id: snapshot1._id,
          timestamp: snapshot1.timestamp,
          traits: snapshot1.traits,
          summary: snapshot1.summary
        },
        snapshot2: {
          id: snapshot2._id,
          timestamp: snapshot2.timestamp,
          traits: snapshot2.traits,
          summary: snapshot2.summary
        },
        differences: {
          traits: traitDifferences,
          similarity: similarity,
          driftScore: Math.round((1 - similarity) * 100),
          timeBetween: Math.floor(
            (snapshot2.timestamp - snapshot1.timestamp) / (1000 * 60 * 60 * 24)
          ) + ' days'
        }
      }
    });

  } catch (error) {
    console.error('Error comparing snapshots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to compare snapshots',
      error: error.message
    });
  }
};

// ============================================
// DELETE SNAPSHOT (OPTIONAL)
// ============================================

/**
 * Delete a snapshot
 * DELETE /api/persona/snapshot/:id
 */
export const deleteSnapshot = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const snapshot = await PersonaSnapshot.findOneAndDelete({
      _id: id,
      userId
    });

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: 'Snapshot not found'
      });
    }

    res.json({
      success: true,
      message: 'Snapshot deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting snapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete snapshot',
      error: error.message
    });
  }
};