import debateTurnService from '../services/debateTurnService.js';

/* =====================================================
   SUBMIT TURN
===================================================== */
export const submitTurn = async (req, res) => {
  try {
    const { debateId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    console.log('📝 Turn submission:', {
      debateId,
      userId,
      contentLength: content?.length
    });

    // Submit turn
    const result = await debateTurnService.submitTurn(debateId, userId, content);

    // Emit turn submitted event
    const io = (await import('../sockets/index.js')).getIO();
    if (io) {
      io.to(`debate_${debateId}`).emit('turn:submitted', {
        turn: result.turn,
        debate: result.debate
      });
      console.log('📡 Emitted turn:submitted event');
    }

    // Check if debate is now complete
    if (result.debate.status === 'completed') {
      console.log('🏁 Debate just completed!');
      
      if (io) {
        io.to(`debate_${debateId}`).emit('debate:completed', {
          debateId: result.debate._id,
          winner: result.debate.winner,
          status: 'completed'
        });
        console.log('📡 Emitted debate:completed event');
      }
    }

    res.status(201).json({
      success: true,
      data: {
        turn: result.turn,
        debate: result.debate
      }
    });

  } catch (error) {
    console.error('❌ Submit turn error:', error);
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