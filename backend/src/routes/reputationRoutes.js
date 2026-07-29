import express from 'express';
import {
    getMyReputation,
    getReputationLeaderboard,
    getUserReputation,
} from '../controllers/reputationController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reputationValidators } from '../validators/index.js';

const router = express.Router();

router.get('/me', authenticate, getMyReputation);
router.get('/leaderboard', getReputationLeaderboard);
router.get('/:userId', validate(reputationValidators.byUser), getUserReputation);

export default router;
