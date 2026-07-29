/**
 * COMMUNITY HEALTH CONTROLLER — Phase 9
 * Place at: backend/src/controllers/communityHealthController.js
 *
 * Routes:
 *   GET  /api/communities/:name/health          — get health analysis
 *   POST /api/communities/:name/health/analyse  — force re-analysis (auth)
 */

import Community from '../models/community.js';
import communityHealthGraph from '../services/graph/communityHealthGraph.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const getCommunityHealth = asyncHandler(async (req, res) => {
  const community = await Community.findOne({ name: req.params.name.toLowerCase() })
    .select('_id name displayName postCount healthAnalysis')
    .lean();

  if (!community) {
    return res.status(404).json({ success: false, message: 'Community not found' });
  }

  const existing = community.healthAnalysis;
  if (existing?.analysedAt && existing?.healthScore !== null) {
    const postsSince = community.postCount - (existing.postCountAtAnalysis || 0);
    if (postsSince < 10) {
      return res.status(200).json({ success: true, data: { health: existing, cached: true } });
    }
  }

  const health = await communityHealthGraph.run(community._id);
  return res.status(200).json({ success: true, data: { health, cached: false } });
});

export const analyseCommunityHealth = asyncHandler(async (req, res) => {
  const community = await Community.findOne({ name: req.params.name.toLowerCase() }).lean();

  if (!community) {
    return res.status(404).json({ success: false, message: 'Community not found' });
  }

  const health = await communityHealthGraph.run(community._id, { force: true });
  return res.status(200).json({ success: true, data: { health, cached: false } });
});