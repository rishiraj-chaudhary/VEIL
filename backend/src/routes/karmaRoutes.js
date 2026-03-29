import express from 'express';
import { authenticate } from '../middleware/auth.js';
import User from '../models/user.js';
import karmaService from '../services/karmaService.js';

const router = express.Router();

router.get('/me', authenticate, async (req, res) => {
  try {
    const breakdown = await karmaService.getBreakdown(req.user._id);
    res.json({ success: true, data: breakdown });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get karma' });
  }
});

router.post('/recalculate', authenticate, async (req, res) => {
  try {
    const result = await karmaService.recalculate(req.user._id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to recalculate karma' });
  }
});

router.get('/leaderboard', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
        .select('username karma')
        .sort({ karma: -1 })
        .limit(20)
        .lean();

    res.json({
      success: true,
      data: {
        leaderboard: users.map((u, i) => ({
          rank:     i + 1,
          username: u.username,
          karma:    u.karma || 0,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get karma leaderboard' });
  }
});

export default router;