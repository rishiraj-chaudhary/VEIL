import Debate from '../models/debate.js';
import DebateReaction from '../models/debateReaction.js';
import DebateTurn from '../models/debateTurn.js';
import DebateVote from '../models/debateVote.js';
import { emitReactionAdded, emitVoteCast, getIO } from '../sockets/index.js';

/* =====================================================
   VOTE ON ROUND
===================================================== */
export const voteOnRound = async (req, res) => {
  try {
    const { debateId, round } = req.params;
    const { vote, confidence = 3 } = req.body;

    // Validation
    if (!vote || !['for', 'against'].includes(vote)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vote. Must be "for" or "against"'
      });
    }

    if (confidence < 1 || confidence > 5) {
      return res.status(400).json({
        success: false,
        message: 'Confidence must be between 1 and 5'
      });
    }

    // Check if debate exists
    const debate = await Debate.findById(debateId);
    if (!debate) {
      return res.status(404).json({
        success: false,
        message: 'Debate not found'
      });
    }

    // Check if user is a participant (participants can't vote)
    if (debate.isParticipant(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Participants cannot vote on their own debate'
      });
    }

    // Check if round is valid
    const roundNum = parseInt(round);
    if (roundNum < 1 || roundNum > debate.rounds.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid round number'
      });
    }

    // Check if already voted
    const existingVote = await DebateVote.findOne({
      debate: debateId,
      round: roundNum,
      user: req.user._id
    });

    if (existingVote) {
      // Update existing vote
      existingVote.vote = vote;
      existingVote.confidence = confidence;
      await existingVote.save();

      // ✨ EMIT SOCKET EVENT
      const io = getIO();
      emitVoteCast(io, debateId, {
        round: roundNum,
        vote,
        confidence
      });

      return res.status(200).json({
        success: true,
        message: 'Vote updated successfully',
        data: { vote: existingVote }
      });
    }

    // Create new vote
    const newVote = await DebateVote.create({
      debate: debateId,
      round: roundNum,
      user: req.user._id,
      vote,
      confidence
    });

    // ✨ EMIT SOCKET EVENT
    const io = getIO();
    emitVoteCast(io, debateId, {
      round: roundNum,
      vote,
      confidence
    });

    res.status(201).json({
      success: true,
      message: 'Vote recorded successfully',
      data: { vote: newVote }
    });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to record vote'
    });
  }
};

/* =====================================================
   GET ROUND VOTES
===================================================== */
export const getRoundVotes = async (req, res) => {
  try {
    const { debateId, round } = req.params;

    const votes = await DebateVote.getRoundVotes(
      debateId,
      parseInt(round)
    );

    res.status(200).json({
      success: true,
      data: { votes }
    });
  } catch (error) {
    console.error('Get votes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch votes'
    });
  }
};

/* =====================================================
   GET ALL DEBATE VOTES
===================================================== */
export const getDebateVotes = async (req, res) => {
  try {
    const { debateId } = req.params;

    const votes = await DebateVote.getDebateVotes(debateId);

    res.status(200).json({
      success: true,
      data: { votes }
    });
  } catch (error) {
    console.error('Get debate votes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch votes'
    });
  }
};

/* =====================================================
   REACT TO TURN
===================================================== */
export const reactToTurn = async (req, res) => {
  try {
    const { turnId } = req.params;
    const { reactionType, comment } = req.body;

    // Validation
    const validReactions = ['agree', 'disagree', 'strong_point', 'fallacy'];
    if (!reactionType || !validReactions.includes(reactionType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid reaction. Must be one of: ${validReactions.join(', ')}`
      });
    }

    // Check if turn exists
    const turn = await DebateTurn.findById(turnId);
    if (!turn) {
      return res.status(404).json({
        success: false,
        message: 'Turn not found'
      });
    }

    // Check if user already reacted
    const existingReaction = await DebateReaction.findOne({
      turn: turnId,
      user: req.user._id
    });

    if (existingReaction) {
      // Update existing reaction
      existingReaction.reactionType = reactionType;
      if (comment) existingReaction.comment = comment;
      await existingReaction.save();

      // ✨ EMIT SOCKET EVENT
      const io = getIO();
      emitReactionAdded(io, turn.debate.toString(), turnId, {
        reactionType
      });

      return res.status(200).json({
        success: true,
        message: 'Reaction updated successfully',
        data: { reaction: existingReaction }
      });
    }

    // Create new reaction
    const reaction = await DebateReaction.create({
      debate: turn.debate,
      turn: turnId,
      user: req.user._id,
      reactionType,
      comment
    });

    // ✨ EMIT SOCKET EVENT
    const io = getIO();
    emitReactionAdded(io, turn.debate.toString(), turnId, {
      reactionType
    });

    res.status(201).json({
      success: true,
      message: 'Reaction recorded successfully',
      data: { reaction }
    });
  } catch (error) {
    console.error('React to turn error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to record reaction'
    });
  }
};

/* =====================================================
   GET TURN REACTIONS
===================================================== */
export const getTurnReactions = async (req, res) => {
  try {
    const { turnId } = req.params;

    const reactions = await DebateReaction.getReactionCounts(turnId);

    res.status(200).json({
      success: true,
      data: { reactions }
    });
  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reactions'
    });
  }
};

/* =====================================================
   GET DEBATE REACTIONS SUMMARY
===================================================== */
export const getDebateReactions = async (req, res) => {
  try {
    const { debateId } = req.params;

    const summary = await DebateReaction.getDebateSummary(debateId);

    res.status(200).json({
      success: true,
      data: { summary }
    });
  } catch (error) {
    console.error('Get debate reactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reactions'
    });
  }
};

/* =====================================================
   DELETE REACTION
===================================================== */
export const deleteReaction = async (req, res) => {
  try {
    const { reactionId } = req.params;

    const reaction = await DebateReaction.findById(reactionId);

    if (!reaction) {
      return res.status(404).json({
        success: false,
        message: 'Reaction not found'
      });
    }

    // Check ownership
    if (!reaction.user.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this reaction'
      });
    }

    await reaction.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Reaction deleted successfully'
    });
  } catch (error) {
    console.error('Delete reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete reaction'
    });
  }
};