import debateAssistantService from '../services/debateAssistantService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * Get live debate insights
 */
export const getLiveInsights = asyncHandler(async (req, res) => {
  const { debateId } = req.params;
  const { currentDraft, side } = req.body;
  const userId = req.user.id;

  if (!currentDraft) {
    return res.status(400).json({
      success: false,
      error: 'Current draft is required'
    });
  }

  const insights = await debateAssistantService.getLiveDebateInsights({
    debateId,
    userId,
    currentDraft,
    side
  });

  res.json({
    success: true,
    insights
  });
});