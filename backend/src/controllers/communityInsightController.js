import { asyncHandler } from '../middleware/errorHandler.js';
import Community from '../models/community.js';
import communityInsightService from '../services/communityInsightService.js';
import { notFound } from '../utils/AppError.js';

/**
 * GET /api/communities/:name/insights
 *
 * Health and memory in one response. The two were always rendered together but
 * fetched separately, which meant two requests and two full passes over the
 * same posts and comments.
 */
export const getCommunityInsights = asyncHandler(async (req, res) => {
  const community = await Community.findOne({ name: req.params.name.toLowerCase() }).select('_id name').lean();
  if (!community) throw notFound('Community not found');

  const insights = await communityInsightService.getInsights(community._id);

  res.status(200).json({ success: true, data: insights });
});
