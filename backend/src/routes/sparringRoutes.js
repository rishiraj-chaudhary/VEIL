/**
 * Sparring agent routes.
 *
 * Mounted in server.js as:
 *   app.use('/api/sparring', aiLimiter, enforceAIBudget, sparringRoutes);
 */

import express from 'express';
import { runSparringSession } from '../controllers/sparringController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sparringValidators } from '../validators/index.js';

const router = express.Router();

router.post('/', authenticate, validate(sparringValidators.run), runSparringSession);

export default router;
