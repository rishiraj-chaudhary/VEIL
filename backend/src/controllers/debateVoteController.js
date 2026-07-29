import Debate from '../models/debate.js';
import DebateTurn from '../models/debateTurn.js';
import DebateVote from '../models/debateVote.js';
import { emitReactionAdded, emitVoteCast, getIO } from '../sockets/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/* =====================================================
   VOTE ON ROUND
===================================================== */
export const voteOnRound = asyncHandler(async (req, res) => {
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
});

/* =====================================================
   GET ROUND VOTES
===================================================== */
export const getRoundVotes = asyncHandler(async (req, res) => {
  const { debateId, round } = req.params;

  const votes = await DebateVote.getRoundVotes(
    debateId,
    parseInt(round)
  );

  res.status(200).json({
    success: true,
    data: { votes }
  });
});

/* =====================================================
   GET ALL DEBATE VOTES
===================================================== */
export const getDebateVotes = asyncHandler(async (req, res) => {
  const { debateId } = req.params;

  const votes = await DebateVote.getDebateVotes(debateId);

  res.status(200).json({
    success: true,
    data: { votes }
  });
});

/* =====================================================
   REACT TO TURN
===================================================== */
