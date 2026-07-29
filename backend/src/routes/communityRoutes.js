import express from 'express';
import {
    createCommunity,
    getAllCommunities,
    getCommunity,
    joinCommunity,
    leaveCommunity,
} from '../controllers/communityController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { communityValidators } from '../validators/index.js';

const router = express.Router();

// Public routes
router.get('/', getAllCommunities);
router.get('/:name', validate(communityValidators.byName), getCommunity);

// Protected routes
router.post('/', authenticate, validate(communityValidators.create), createCommunity);
router.post('/:name/join', authenticate, validate(communityValidators.byName), joinCommunity);
router.post('/:name/leave', authenticate, validate(communityValidators.byName), leaveCommunity);

export default router;