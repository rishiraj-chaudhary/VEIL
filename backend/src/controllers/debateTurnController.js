import User from '../models/user.js';
import { JOB_TYPES } from '../services/jobHandlers.js';
import jobQueue from '../services/jobQueue.js';
import debateTurnService from '../services/debateTurnService.js';
import { getIO } from '../sockets/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * ✅ SUBMIT TURN (with AI cost tracking)
 */
export const submitTurn = asyncHandler(async (req, res) => {
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

  // Queued rather than fired inline: a deploy or crash between the response and
  // the model call would otherwise leave the debate waiting on a turn that was
  // never written, with nothing recording that it was owed.
  await jobQueue.enqueue(JOB_TYPES.AI_OPPONENT_TURN, { debateId },
    { dedupeKey: `ai-turn:${debateId}` });

  res.json({
    success: true,
    message: 'Turn submitted successfully',
    data: result.turn
  });
});

/**
 * Get all turns for a debate
 */
export const getDebateTurns = asyncHandler(async (req, res) => {
  const { debateId } = req.params;
  
  const result = await debateTurnService.getDebateTurns(debateId);
  
  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json({
    success: true,
    data: result.turns
  });
});

/**
 * Get single turn
 */
export const getTurn = asyncHandler(async (req, res) => {
  const { turnId } = req.params;
  
  const result = await debateTurnService.getTurn(turnId);
  
  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json({
    success: true,
    data: result.turn
  });
});

/**
 * Get turns by round
 */
export const getTurnsByRound = asyncHandler(async (req, res) => {
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
});

/**
 * Check if user can submit turn
 */
export const canSubmitTurn = asyncHandler(async (req, res) => {
  const { debateId } = req.params;
  const userId = req.user._id;
  
  const result = await debateTurnService.canSubmitTurn(debateId, userId);
  
  res.json({
    success: true,
    data: result
  });
});