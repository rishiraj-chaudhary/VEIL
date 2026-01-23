import debateTurnService from '../services/debateTurnService.js';
import { emitDebateCompleted, emitRoundAdvanced, emitTurnSubmitted, getIO } from '../sockets/index.js';

/* =====================================================
   SUBMIT TURN
===================================================== */
export const submitTurn = async (req, res) => {
  try {
    const { debateId } = req.params;
    const { content } = req.body;

    // Validation
    if (!content || content.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Content must be at least 10 characters'
      });
    }

    // Check if user can submit
    const canSubmit = await debateTurnService.canSubmitTurn(
      debateId,
      req.user._id
    );

    if (!canSubmit.canSubmit) {
      return res.status(403).json({
        success: false,
        message: canSubmit.reason
      });
    }

    const result = await debateTurnService.submitTurn(
      debateId,
      req.user._id,
      content
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // ✨ EMIT SOCKET EVENTS
    const io = getIO();
    
    // Emit turn submitted
    emitTurnSubmitted(io, debateId, {
      turn: result.turn,
      nextTurn: result.nextTurn,
      currentRound: result.debate.currentRound
    });

    // If round advanced, emit round event
    if (result.roundAdvanced) {
      emitRoundAdvanced(io, debateId, {
        currentRound: result.debate.currentRound
      });
    }

    // If debate completed, emit completion event
    if (result.debate.status === 'completed') {
      emitDebateCompleted(io, debateId, {
        winner: result.debate.winner,
        finalScores: result.debate.finalScores
      });
    }

    res.status(201).json({
      success: true,
      message: 'Turn submitted successfully',
      data: {
        turn: result.turn,
        debate: result.debate,
        nextTurn: result.nextTurn
      }
    });
  } catch (error) {
    console.error('Submit turn error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit turn'
    });
  }
};

/* =====================================================
   GET DEBATE TURNS
===================================================== */
export const getDebateTurns = async (req, res) => {
  try {
    const { debateId } = req.params;
    const { round, side, includeAI } = req.query;

    const result = await debateTurnService.getDebateTurns(debateId, {
      round: round ? parseInt(round) : undefined,
      side,
      includeAI: includeAI === 'true'
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json({
      success: true,
      data: { turns: result.turns }
    });
  } catch (error) {
    console.error('Get turns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch turns'
    });
  }
};

/* =====================================================
   GET TURNS BY ROUND
===================================================== */
export const getTurnsByRound = async (req, res) => {
  try {
    const { debateId } = req.params;

    const result = await debateTurnService.getTurnsByRound(debateId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json({
      success: true,
      data: { rounds: result.rounds }
    });
  } catch (error) {
    console.error('Get turns by round error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch turns'
    });
  }
};

/* =====================================================
   GET SINGLE TURN
===================================================== */
export const getTurn = async (req, res) => {
  try {
    const { turnId } = req.params;

    const result = await debateTurnService.getTurn(turnId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json({
      success: true,
      data: { turn: result.turn }
    });
  } catch (error) {
    console.error('Get turn error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch turn'
    });
  }
};

/* =====================================================
   CHECK IF USER CAN SUBMIT
===================================================== */
export const canSubmitTurn = async (req, res) => {
  try {
    const { debateId } = req.params;

    const result = await debateTurnService.canSubmitTurn(
      debateId,
      req.user._id
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Can submit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check submission eligibility'
    });
  }
};