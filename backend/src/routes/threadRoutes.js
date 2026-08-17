/**
 * THREAD ROUTES — Step 13
 *
 * Place at: backend/src/routes/threadRoutes.js
 *
 * Register in app.js:
 *   import threadRoutes from './routes/threadRoutes.js';
 *   app.use('/api/thread', threadRoutes);
 */

import express from 'express';
import { forceThreadAnalysis, getThreadAnalysis } from '../controllers/threadController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { threadValidators } from '../validators/index.js';

const router = express.Router();

// GET /api/thread/:postId/analysis
//
// Authenticated, despite being a read. On a cache miss this runs the thread
// evolution graph — sentiment arc, topic drift, turning points — which is a
// series of model calls. Left open, anyone could force that work by requesting
// a different post id repeatedly, at no cost to themselves and real cost here.
router.get('/:postId/analysis', authenticate, validate(threadValidators.byPost), getThreadAnalysis);

// POST /api/thread/:postId/analyse — force re-analysis (auth required)
router.post('/:postId/analyse', authenticate, validate(threadValidators.byPost), forceThreadAnalysis);

export default router;