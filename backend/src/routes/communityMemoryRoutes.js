/**
 * COMMUNITY MEMORY ROUTES — Step 15
 *
 * Place at: backend/src/routes/communityMemoryRoutes.js
 *
 * Register in server.js:
 *   import communityMemoryRoutes from './src/routes/communityMemoryRoutes.js';
 *   app.use('/api/communities', communityMemoryRoutes);
 *
 * NOTE: mount at /api/communities so routes become:
 *   GET  /api/communities/:name/memory
 *   POST /api/communities/:name/memory/analyse
 */

import express from 'express';
import { analyseCommunityMemory, getCommunityMemory } from '../controllers/communityMemoryController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/:name/memory', getCommunityMemory);
router.post('/:name/memory/analyse', authenticate, analyseCommunityMemory);

export default router;