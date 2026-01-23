import debateScoringService from '../services/debateScoringService.js';
import debateService from '../services/debateService.js';
import { emitDebateCancelled, emitDebateStarted, emitParticipantJoined, emitParticipantReady, getIO } from '../sockets/index.js';

/* =====================================================
   CREATE DEBATE
===================================================== */
export const createDebate = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Create debate error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create debate'
    });
  }
};

/* =====================================================
   GET ALL DEBATES
===================================================== */
export const getDebates = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get debates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch debates'
    });
  }
};

/* =====================================================
   GET SINGLE DEBATE
===================================================== */
export const getDebate = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get debate error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch debate'
    });
  }
};

/* =====================================================
   JOIN DEBATE
===================================================== */
export const joinDebate = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Join debate error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to join debate'
    });
  }
};

/* =====================================================
   MARK READY
===================================================== */
export const markReady = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Mark ready error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to mark ready'
    });
  }
};

/* =====================================================
   LEAVE DEBATE
===================================================== */
export const leaveDebate = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Leave debate error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to leave debate'
    });
  }
};

/* =====================================================
   CANCEL DEBATE
===================================================== */
export const cancelDebate = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Cancel debate error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel debate'
    });
  }
};

/* =====================================================
   GET DEBATE STATISTICS
===================================================== */
export const getDebateStats = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await debateService.getDebateStats(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json({
      success: true,
      data: result.stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
};

/* =====================================================
   GET DEBATE SCORE
===================================================== */
export const getDebateScore = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await debateScoringService.getDebateScore(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json({
      success: true,
      data: { score: result.score }
    });
  } catch (error) {
    console.error('Get score error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch score'
    });
  }
};