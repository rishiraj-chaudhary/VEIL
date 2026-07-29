import { asyncHandler } from '../middleware/errorHandler.js';
import drillService, { MIN_WORDS } from '../services/drillService.js';
import { badRequest, unauthorized } from '../utils/AppError.js';

export const getTodayDrill = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw unauthorized('Authentication required');

  const [drill, streak] = await Promise.all([
    drillService.getToday(userId),
    drillService.getStreak(userId),
  ]);

  res.status(200).json({ success: true, data: { drill, streak } });
});

export const submitDrill = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw unauthorized('Authentication required');

  const result = await drillService.submit(userId, req.body.response);

  if (!result.ok) {
    if (result.reason === 'too-short') {
      throw badRequest(`Write at least ${MIN_WORDS} words — you wrote ${result.words}.`);
    }
    if (result.reason === 'already-done') {
      return res.status(200).json({
        success: true,
        message: "You've already done today's drill.",
        data: { drill: result.drill, alreadyCompleted: true },
      });
    }
    throw badRequest('No drill is open for today.');
  }

  res.status(200).json({ success: true, data: result });
});

export const getDrillHistory = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw unauthorized('Authentication required');

  const limit = Math.min(90, parseInt(req.query.limit, 10) || 30);

  const [history, streak] = await Promise.all([
    drillService.getHistory(userId, limit),
    drillService.getStreak(userId),
  ]);

  res.status(200).json({ success: true, data: { history, streak } });
});
