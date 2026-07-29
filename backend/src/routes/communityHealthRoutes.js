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
import { getCommunityInsights } from '../controllers/communityInsightController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { communityAnalysisValidators } from '../validators/index.js';

const router = express.Router();

router.get('/:name/insights',         validate(communityAnalysisValidators.byName), getCommunityInsights);
router.get('/:name/health',           validate(communityAnalysisValidators.byName), getCommunityHealth);
router.post('/:name/health/analyse',  authenticate, validate(communityAnalysisValidators.byName), analyseCommunityHealth);

export default router;