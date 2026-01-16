import express from 'express';
import {
    createCommunity,
    getAllCommunities,
    getCommunity,
    joinCommunity,
    leaveCommunity,
} from '../controllers/communityController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/', getAllCommunities);
router.get('/:name', getCommunity);

// Protected routes
router.post('/', authenticate, createCommunity);
router.post('/:name/join', authenticate, joinCommunity);
router.post('/:name/leave', authenticate, leaveCommunity);

export default router;