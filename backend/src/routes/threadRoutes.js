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

const router = express.Router();

// GET /api/thread/:postId/analysis — get thread analysis (public)
router.get('/:postId/analysis', getThreadAnalysis);

// POST /api/thread/:postId/analyse — force re-analysis (auth required)
router.post('/:postId/analyse', authenticate, forceThreadAnalysis);

export default router;