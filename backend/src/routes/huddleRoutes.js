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
import { validate } from '../middleware/validate.js';
import { huddleValidators } from '../validators/index.js';

const router = express.Router();

router.post('/',                    authenticate, validate(huddleValidators.create), createHuddle);
router.get('/my',                   authenticate, getMyHuddles);
router.post('/join/:joinCode',      authenticate, validate(huddleValidators.join), joinHuddle);
router.get('/:id',                  authenticate, validate(huddleValidators.byId), getHuddle);
router.post('/:id/transcript',      authenticate, validate(huddleValidators.transcript), addTranscriptEntry);
router.post('/:id/end',             authenticate, validate(huddleValidators.byId), endHuddle);
router.get('/:id/summary',          authenticate, validate(huddleValidators.byId), getHuddleSummary);
router.post('/:id/publish',         authenticate, validate(huddleValidators.publish), publishHuddlePost);

export default router;