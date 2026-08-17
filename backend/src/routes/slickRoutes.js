import express from 'express';
import {
  createSlick,
  getPerception,
  getReceivedSlicks,
  getSentSlicks,
  getSlickInsights,
  getSlickSuggestions,
  getUserCurrency,
  reactToSlick,
  revealSlickAuthor,
} from '../controllers/slickController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { slickValidators } from '../validators/index.js';

const router = express.Router();
router.use(authenticate);

router.post('/',              validate(slickValidators.create), createSlick);
router.get('/received',       getReceivedSlicks);
router.get('/sent',           getSentSlicks);
router.post('/:id/react',     validate(slickValidators.byId), reactToSlick);
router.post('/:id/reveal',    validate(slickValidators.byId), revealSlickAuthor);
router.get('/insights',       getSlickInsights);
router.get('/suggestions/:targetUserId', validate(slickValidators.byTargetUser), getSlickSuggestions);
router.get('/currency',       getUserCurrency);

// Perception — how others see this user, derived from received feedback.
// This was an inline handler here that re-imported its models per request and
// returned raw error messages to the client; it is a controller now, like every
// other route in this file.
router.get('/perception/:userId', validate(slickValidators.byUser), getPerception);

export default router;
