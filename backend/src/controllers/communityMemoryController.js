/**
 * COMMUNITY MEMORY CONTROLLER — Step 15
 *
 * Place at: backend/src/controllers/communityMemoryController.js
 *
 * Routes:
 *   GET  /api/communities/:name/memory        — get memory analysis
 *   POST /api/communities/:name/memory/analyse — force re-analysis (auth)
 */

import Community from '../models/community.js';
import communityMemoryGraph from '../services/graph/communityMemoryGraph.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /api/communities/:name/memory
 * Returns cached analysis or triggers a fresh one.
 */
export const getCommunityMemory = asyncHandler(async (req, res) => {
  const community = await Community.findOne({ name: req.params.name.toLowerCase() })
    .select('_id name displayName memberCount postCount memoryAnalysis')
    .lean();

  if (!community) {
    return res.status(404).json({ success: false, message: 'Community not found' });
  }

  const existing = community.memoryAnalysis;

  // Return cache if fresh
  if (existing?.analysedAt && existing?.onboardingSummary) {
    const postsSince = community.postCount - (existing.postCountAtAnalysis || 0);
    if (postsSince < 20) {
      return res.status(200).json({
        success: true,
        data: { memory: existing, cached: true },
      });
    }
  }

  // Run fresh analysis
  const memory = await communityMemoryGraph.run(community._id);

  return res.status(200).json({
    success: true,
    data: { memory, cached: false },
  });
});

/**
 * POST /api/communities/:name/memory/analyse
 * Force re-analysis (auth required).
 */
export const analyseCommunityMemory = asyncHandler(async (req, res) => {
  const community = await Community.findOne({ name: req.params.name.toLowerCase() }).lean();

  if (!community) {
    return res.status(404).json({ success: false, message: 'Community not found' });
  }

  const memory = await communityMemoryGraph.run(community._id, { force: true });

  return res.status(200).json({
    success: true,
    data: { memory, cached: false },
  });
});