import express from 'express';
import { getDrillHistory, getTodayDrill, submitDrill } from '../controllers/drillController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { drillValidators } from '../validators/index.js';

const router = express.Router();

router.get('/today', authenticate, getTodayDrill);
router.post('/today', authenticate, validate(drillValidators.submit), submitDrill);
router.get('/history', authenticate, validate(drillValidators.history), getDrillHistory);

export default router;
