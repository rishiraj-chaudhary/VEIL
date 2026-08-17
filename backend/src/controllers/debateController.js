/**
 * DEBATE CONTROLLER
 *
 * This file also carried its own `submitTurn` and `completeDebate` — a second,
 * divergent copy of the turn pipeline that no route ever mounted (the real one
 * is debateTurnController → debateTurnService). The copy had drifted badly:
 * it called `refutationDetectionService` without importing it, which would have
 * thrown inside a `setImmediate` and taken the process down had it ever run.
 * Both are gone; debate completion, scoring and summarisation now happen in the
 * SCORE_DEBATE job, which is the one path that actually executes.
 */

import aiOpponentService from '../services/aiOpponentService.js';
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
    // `req.user` is only present when the caller sent a valid token — this
    // route is public. Reading `req.user._id` unconditionally threw a
    // TypeError for any anonymous request that passed ?myDebates=true.
    userId: myDebates === 'true' ? req.user?._id : undefined,
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
