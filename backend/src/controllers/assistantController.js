import debateAssistantService from '../services/debateAssistantService.js';

/**
 * Get live debate insights
 */
export const getLiveInsights = async (req, res) => {
  try {
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

  } catch (error) {
    console.error('Get live insights error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};