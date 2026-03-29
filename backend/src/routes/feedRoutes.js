/**
 * FEED ROUTES — Step 12
 *
 * Place at: backend/src/routes/feedRoutes.js
 *
 * Register in your main router (e.g. app.js / index.js):
 *   import feedRoutes from './routes/feedRoutes.js';
 *   app.use('/api/feed', feedRoutes);
 */

import express from 'express';
import {
    classifyPostIntent,
    getPersonalisedFeed,
    getWhyExplanation,
} from '../controllers/feedController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /api/feed — personalised AI-ranked feed (auth required)
router.get('/', authenticate, getPersonalisedFeed);

// GET /api/feed/why/:postId — why is this post in my feed?
router.get('/why/:postId', authenticate, getWhyExplanation);

// POST /api/feed/classify/:postId — manually classify a post's intent (dev/admin)
router.post('/classify/:postId', authenticate, classifyPostIntent);

export default router;