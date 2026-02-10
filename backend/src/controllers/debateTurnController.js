import User from '../models/user.js';
import debateTurnService from '../services/debateTurnService.js';
import { getIO } from '../sockets/index.js';

/**
 * ✅ SUBMIT TURN (with AI cost tracking)
 */
export const submitTurn = async (req, res) => {
  try {
    const { debateId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    console.log(`📝 Turn submitted by user: ${userId} for debate: ${debateId}`);

    // Validation
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Turn content is required'
      });
    }

    // ✅ Get user tier for AI cost tracking
    const user = await User.findById(userId);
    const userTier = user?.subscription?.tier || 'free';

    console.log(`💰 User: ${user.username} (tier: ${userTier})`);
    console.log(`🤖 Submitting turn with AI tracking...`);

    // Submit turn through service (this creates the turn and runs AI analysis)
    const result = await debateTurnService.submitDebateTurn(
      debateId,
      userId,
      content,
      userTier  // ✅ Pass user tier for AI tracking
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    console.log(`✅ Turn submitted successfully with AI analysis`);

    // ✨ EMIT SOCKET EVENT
    const io = getIO();
    if (io) {
      io.to(`debate-${debateId}`).emit('turn-submitted', {
        turn: result.turn
      });

      // Emit analysis complete
      setTimeout(() => {
        io.to(`debate-${debateId}`).emit('analysis-complete', {
          turnId: result.turn._id
        });
      }, 500);
    }

    res.json({
      success: true,
      message: 'Turn submitted successfully',
      data: result.turn
    });

  } catch (error) {
    console.error('❌ Submit turn error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit turn',
      error: error.message
    });
  }
};

/**
 * Get all turns for a debate
 */
export const getDebateTurns = async (req, res) => {
  try {
    const { debateId } = req.params;
    
    const result = await debateTurnService.getDebateTurns(debateId);
    
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      success: true,
      data: result.turns
    });

  } catch (error) {
    console.error('❌ Get turns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch turns',
      error: error.message
    });
  }
};

/**
 * Get single turn
 */
export const getTurn = async (req, res) => {
  try {
    const { turnId } = req.params;
    
    const result = await debateTurnService.getTurn(turnId);
    
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      success: true,
      data: result.turn
    });

  } catch (error) {
    console.error('❌ Get turn error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch turn',
      error: error.message
    });
  }
};

/**
 * Get turns by round
 */
export const getTurnsByRound = async (req, res) => {
  try {
    const { debateId } = req.params;
    const { round } = req.query;
    
    const result = await debateTurnService.getTurnsByRound(debateId, parseInt(round));
    
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      success: true,
      data: result.turns
    });

  } catch (error) {
    console.error('❌ Get turns by round error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch turns',
      error: error.message
    });
  }
};

/**
 * Check if user can submit turn
 */
export const canSubmitTurn = async (req, res) => {
  try {
    const { debateId } = req.params;
    const userId = req.user._id;
    
    const result = await debateTurnService.canSubmitTurn(debateId, userId);
    
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Check turn eligibility error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check eligibility',
      error: error.message
    });
  }
};