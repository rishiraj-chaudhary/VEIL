/**
 * COMMUNITY HEALTH ROUTES — Phase 9
 * Place at: backend/src/routes/communityHealthRoutes.js
 *
 * Register in server.js:
 *   import communityHealthRoutes from './src/routes/communityHealthRoutes.js';
 *   app.use('/api/communities', communityHealthRoutes);
 */

import express from 'express';
import { analyseCommunityHealth, getCommunityHealth } from '../controllers/communityHealthController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/:name/health',           getCommunityHealth);
router.post('/:name/health/analyse',  authenticate, analyseCommunityHealth);

export default router;