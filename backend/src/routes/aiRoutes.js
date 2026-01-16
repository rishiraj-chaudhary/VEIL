import express from 'express';
import { getAIStatus, oracleReply } from '../controllers/aiController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All AI routes require authentication
router.use(authenticate);

// Oracle AI Assistant
router.post('/oracle', oracleReply);

// AI Service Status
router.get('/status', getAIStatus);

export default router;