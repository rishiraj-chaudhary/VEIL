import express from 'express';
import { getAIStatus, oracleReply } from '../controllers/aiController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiValidators } from '../validators/index.js';

const router = express.Router();

// All AI routes require authentication
router.use(authenticate);

// Oracle AI Assistant
router.post('/oracle', validate(aiValidators.oracle), oracleReply);

// AI Service Status
router.get('/status', getAIStatus);

export default router;