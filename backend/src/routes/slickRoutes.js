import express from 'express';
import {
    createSlick,
    getReceivedSlicks,
    getSentSlicks,
    getSlickInsights,
    getSlickSuggestions,
    getUserCurrency,
    reactToSlick,
    revealSlickAuthor
} from '../controllers/slickController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All slick routes require authentication
router.use(authenticate);

// Main slick operations
router.post('/', createSlick);
router.get('/received', getReceivedSlicks);
router.get('/sent', getSentSlicks);

// Slick interactions
router.post('/:id/react', reactToSlick);
router.post('/:id/reveal', revealSlickAuthor);

// AI-powered features
router.get('/insights', getSlickInsights);
router.get('/suggestions/:targetUserId', getSlickSuggestions);

// Currency system
router.get('/currency', getUserCurrency);

export default router;