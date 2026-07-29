import { asyncHandler } from '../middleware/errorHandler.js';
import User from '../models/user.js';
import argumentReputationService from '../services/argumentReputationService.js';
import { notFound, unauthorized } from '../utils/AppError.js';

/**
 * ARGUMENT REPUTATION CONTROLLER
 *
 * Reputation is deliberately public: a track record only carries weight if
 * others can see it. Nothing here exposes private content — only claims the
 * user chose to make in debates, and how those claims fared.
 */

export const getMyReputation = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw unauthorized('Authentication required');

  const profile = await argumentReputationService.getFullProfile(userId);
  res.status(200).json({ success: true, data: profile });
});

export const getUserReputation = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).select('username').lean();
  if (!user) throw notFound('User not found');

  const profile = await argumentReputationService.getFullProfile(user._id);
  res.status(200).json({ success: true, data: { ...profile, username: user.username } });
});

export const getReputationLeaderboard = asyncHandler(async (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
  const leaderboard = await argumentReputationService.getLeaderboard(limit);
  res.status(200).json({ success: true, data: { leaderboard } });
});
