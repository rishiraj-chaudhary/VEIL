import express from 'express';
import {
    compareSnapshots,
    createSnapshot,
    deleteSnapshot,
    getDriftTimeline,
    getEvolutionStats,
    getLatestSnapshot,
    getSignificantDrifts,
    getSnapshot,
    getSnapshots
} from '../controllers/personaDriftController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// ALL ROUTES REQUIRE AUTHENTICATION
// ============================================
router.use(authenticate);

// ============================================
// SNAPSHOT MANAGEMENT
// ============================================

// Create a new snapshot (manual trigger)
router.post('/snapshot', createSnapshot);

// Get latest snapshot
router.get('/snapshot/latest', getLatestSnapshot);

// Get all snapshots
router.get('/snapshots', getSnapshots);

// Get specific snapshot
router.get('/snapshot/:id', getSnapshot);

// Delete snapshot
router.delete('/snapshot/:id', deleteSnapshot);

// ============================================
// DRIFT ANALYSIS
// ============================================

// Get drift timeline
router.get('/drift/timeline', getDriftTimeline);

// Get significant drift events
router.get('/drift/significant', getSignificantDrifts);

// Compare two snapshots
router.get('/compare/:id1/:id2', compareSnapshots);

// ============================================
// EVOLUTION STATS
// ============================================

// Get evolution statistics
router.get('/evolution', getEvolutionStats);

export default router;