/**
 * HUDDLE ROUTES — Phase 11
 * Place at: backend/src/routes/huddleRoutes.js
 *
 * Register in server.js:
 *   import huddleRoutes from './src/routes/huddleRoutes.js';
 *   app.use('/api/huddles', huddleRoutes);
 */

import express from 'express';
import {
    addTranscriptEntry,
    createHuddle,
    endHuddle,
    getHuddle,
    getHuddleSummary,
    getMyHuddles,
    joinHuddle,
    publishHuddlePost,
} from '../controllers/huddleController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/',                    authenticate, createHuddle);
router.get('/my',                   authenticate, getMyHuddles);
router.post('/join/:joinCode',      authenticate, joinHuddle);
router.get('/:id',                  authenticate, getHuddle);
router.post('/:id/transcript',      authenticate, addTranscriptEntry);
router.post('/:id/end',             authenticate, endHuddle);
router.get('/:id/summary',          authenticate, getHuddleSummary);
router.post('/:id/publish',         authenticate, publishHuddlePost);

export default router;