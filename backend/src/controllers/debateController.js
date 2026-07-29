import User from '../models/user.js';
import aiOpponentService from '../services/aiOpponentService.js';
import { respondAsAIIfNeeded } from '../services/aiTurnOrchestrator.js';
import debateAIService from '../services/debateAIService.js';
import debateScoringService from '../services/debateScoringService.js';
import debateService from '../services/debateService.js';
import { JOB_TYPES } from '../services/jobHandlers.js';
import jobQueue from '../services/jobQueue.js';
import { emitDebateCancelled, emitDebateStarted, emitParticipantJoined, emitParticipantReady, getIO } from '../sockets/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/* =====================================================
   CREATE DEBATE
===================================================== */
export const createDebate = asyncHandler(async (req, res) => {
  const {
    topic,
    description,
    type = 'text',
    format = '1v1',
    visibility = 'public',
    initiatorSide = 'for',
    originType,
    originId,
    customRounds
  } = req.body;

  // Validation
  if (!topic || topic.trim().length < 3) {
    return res.status(400).json({
      success: false,
      message: 'Topic must be at least 3 characters'
    });
  }

  const result = await debateService.createDebate({
    topic,
    description,
    type,
    format,
    visibility,
    initiatorId: req.user._id,
    initiatorSide,
    originType,
    originId,
    customRounds
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(201).json({
    success: true,
    message: 'Debate created successfully',
    data: { debate: result.debate }
  });
});

/* =====================================================
   GET ALL DEBATES
===================================================== */
export const getDebates = asyncHandler(async (req, res) => {
  const {
    status,
    type,
    visibility,
    originType,
    originId,
    myDebates,
    limit = 20,
    page = 1,
    sort = '-createdAt'
  } = req.query;

  const result = await debateService.getDebates({
    status,
    type,
    visibility,
    originType,
    originId,
    userId: myDebates === 'true' ? req.user._id : undefined,
    limit,
    page,
    sort
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(200).json({
    success: true,
    data: result
  });
});

/* =====================================================
   GET SINGLE DEBATE
===================================================== */
export const getDebate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await debateService.getDebate(id);

  if (!result.success) {
    return res.status(404).json(result);
  }

  // Increment view count
  await debateService.incrementViewCount(id);

  res.status(200).json({
    success: true,
    data: { debate: result.debate }
  });
});

/* =====================================================
   JOIN DEBATE
===================================================== */
export const joinDebate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { side } = req.body;

  // Validation
  if (!side || !['for', 'against'].includes(side)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid side. Must be "for" or "against"'
    });
  }

  const result = await debateService.joinDebate(id, req.user._id, side);

  if (!result.success) {
    return res.status(400).json(result);
  }

  // ✨ EMIT SOCKET EVENT
  const io = getIO();
  emitParticipantJoined(io, id, {
    userId: req.user._id,
    username: req.user.username,
    side
  });

  res.status(200).json({
    success: true,
    message: `Joined debate on side '${side}'`,
    data: { debate: result.debate }
  });
});

/* =====================================================
   MARK READY
===================================================== */
export const markReady = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await debateService.markReady(id, req.user._id);

  if (!result.success) {
    return res.status(400).json(result);
  }

  // ✨ EMIT SOCKET EVENTS
  const io = getIO();
  
  // Emit ready status
  emitParticipantReady(io, id, req.user._id, req.user.username);

  // If debate started, emit start event
  if (result.started) {
    emitDebateStarted(io, id, result.debate);
  }

  res.status(200).json({
    success: true,
    message: result.started ? 'Debate started!' : 'Marked as ready',
    data: {
      debate: result.debate,
      started: result.started
    }
  });
});

/* =====================================================
   LEAVE DEBATE
===================================================== */
export const leaveDebate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await debateService.leaveDebate(id, req.user._id);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(200).json({
    success: true,
    message: 'Left debate successfully',
    data: { debate: result.debate }
  });
});

/* =====================================================
   CANCEL DEBATE
===================================================== */
export const cancelDebate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await debateService.cancelDebate(id, req.user._id);

  if (!result.success) {
    return res.status(400).json(result);
  }

  // ✨ EMIT SOCKET EVENT
  const io = getIO();
  emitDebateCancelled(io, id);

  res.status(200).json({
    success: true,
    message: 'Debate cancelled successfully',
    data: { debate: result.debate }
  });
});

/* =====================================================
   GET DEBATE STATISTICS
===================================================== */
export const getDebateStats = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await debateService.getDebateStats(id);

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.status(200).json({
    success: true,
    data: result.stats
  });
});

/* =====================================================
   ✅ UPDATED: GET DEBATE SCORE (with cost tracking)
===================================================== */
export const getDebateScore = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await debateScoringService.getDebateScore(id);

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.status(200).json({
    success: true,
    data: { score: result.score }
  });
});

/* =====================================================
   AI OPPONENT — practice debate with no second human
===================================================== */
export const createAIDebate = asyncHandler(async (req, res) => {
  const { topic, description, side = 'for', difficulty = 'balanced', style = 'evidence' } = req.body;

  const debate = await aiOpponentService.createDebateVsAI({
    topic,
    description,
    userId: req.user._id,
    userSide: side,
    difficulty,
    style,
  });

  // The AI opens if it holds the 'for' side.
  if (side === 'against') {
    await jobQueue.enqueue(JOB_TYPES.AI_OPPONENT_TURN, { debateId: debate._id.toString() },
      { dedupeKey: `ai-turn:${debate._id}` });
  }

  res.status(201).json({ success: true, message: 'Practice debate created', data: debate });
});

export const getAIOpponentProfiles = async (req, res) => {
  res.json({ success: true, data: aiOpponentService.listProfiles() });
};

/* =====================================================
   ✅ NEW: SUBMIT TURN (with AI cost tracking)
===================================================== */
export const submitTurn = asyncHandler(async (req, res) => {
  const { id: debateId } = req.params;
  const { content } = req.body;
  const userId = req.user._id;

  // Validation
  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Turn content is required'
    });
  }

  // Submit turn through debate service
  const result = await debateService.submitTurn(debateId, userId, content);

  if (!result.success) {
    return res.status(400).json(result);
  }

  // ✅ Get user tier for AI cost tracking
  const user = await User.findById(userId);
  const userTier = user?.subscription?.tier || 'free';

  // ✅ Analyze turn with AI (with cost tracking)
  const aiAnalysis = await debateAIService.analyzeTurn(
    content,
    result.turn.side,
    result.previousTurns || [],
    userId,      // ✅ Track who made the request
    debateId,    // ✅ Track which debate
    userTier     // ✅ User's subscription tier
  );

  // Update turn with AI analysis
  result.turn.aiAnalysis = aiAnalysis;
  await result.turn.save();

  // Process claims for knowledge graph — userId attributes each claim to its
  // author, which is what the argument track record is built from.
  if (aiAnalysis.claims && aiAnalysis.claims.length > 0) {
    await debateAIService.processClaimsForGraph(
      aiAnalysis.claims,
      result.turn,
      result.debate,
      aiAnalysis.overallQuality,
      userId
    );
  }

  // Detect which of the opponent's claims this turn refutes. Runs after claim
  // ingestion so this turn's own claims are already recorded, and detached
  // from the response since it involves an LLM call.
  setImmediate(() => {
    refutationDetectionService.processTurn({
      debateId,
      authorSide: result.turn.side,
      rebuttalText: content,
      rebuttalQuality: aiAnalysis.overallQuality ?? 50,
    }).catch(err => console.error('Refutation detection error:', err.message));
  });

  // Store turn in debate memory (RAG)
  await debateAIService.storeInMemory(result.turn, result.debate);

  // ✨ EMIT SOCKET EVENTS
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

  // If the opponent is the AI, produce its reply after responding to the user
  // so the client isn't held open for a second model call.
  await jobQueue.enqueue(JOB_TYPES.AI_OPPONENT_TURN, { debateId },
    { dedupeKey: `ai-turn:${debateId}` });

  res.json({
    success: true,
    message: 'Turn submitted successfully',
    data: result.turn
  });
});

/* =====================================================
   ✅ NEW: COMPLETE DEBATE (with AI cost tracking)
===================================================== */
export const completeDebate = asyncHandler(async (req, res) => {
  const { id: debateId } = req.params;
  const userId = req.user?._id;

  const result = await debateService.completeDebate(debateId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  // ✅ Get user tier for AI summary generation
  const user = await User.findById(userId);
  const userTier = user?.subscription?.tier || 'free';

  // ✅ Generate AI summary with cost tracking
  const aiSummary = await debateAIService.generateDebateSummary(
    debateId,
    result.forTurns || [],
    result.againstTurns || [],
    userId,      // ✅ Track summary generation
    userTier     // ✅ User tier
  );

  // Update debate with summary
  result.debate.aiSummary = aiSummary;
  await result.debate.save();

  // ✨ EMIT SOCKET EVENT
  const io = getIO();
  if (io) {
    io.to(`debate-${debateId}`).emit('debate-completed', {
      winner: result.winner,
      finalScores: result.finalScores
    });
  }

  res.json({
    success: true,
    message: 'Debate completed',
    data: {
      debate: result.debate,
      score: result.score
    }
  });
});