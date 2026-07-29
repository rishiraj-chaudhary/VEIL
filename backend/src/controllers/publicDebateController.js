import { asyncHandler } from '../middleware/errorHandler.js';
import Debate from '../models/debate.js';
import DebateTurn from '../models/debateTurn.js';
import { notFound } from '../utils/AppError.js';

/**
 * PUBLIC DEBATE REPLAY
 *
 * Everything else on this platform sits behind authentication, which means a
 * finished debate cannot be shown to anyone who is not already a user — so
 * nothing the product produces can travel. This is the one read path that works
 * without a login.
 *
 * Only finished, public debates are exposed, and only the parts that are
 * inherently public anyway: the arguments and their scores. Private practice
 * debates against the AI are never shared, and per-user coaching, blind spots
 * and drift data are left out entirely.
 */

const isShareable = debate =>
  debate.status === 'completed' && debate.visibility !== 'private';

export const getPublicDebate = asyncHandler(async (req, res) => {
  const debate = await Debate.findById(req.params.id)
    .populate('participants.user', 'username')
    .populate('initiator', 'username')
    .lean();

  if (!debate || !isShareable(debate)) {
    // Deliberately identical for "does not exist" and "not shareable" — the
    // difference would let anyone probe for private debate ids.
    throw notFound('This debate is not available publicly');
  }

  const turns = await DebateTurn.find({ debate: debate._id })
    .sort({ turnNumber: 1 })
    .populate('author', 'username')
    .select('content side round turnNumber createdAt aiAnalysis author')
    .lean();

  res.status(200).json({
    success: true,
    data: {
      debate: {
        _id: debate._id,
        topic: debate.topic,
        description: debate.description,
        status: debate.status,
        winner: debate.winner,
        finalScores: debate.finalScores,
        createdAt: debate.createdAt,
        completedAt: debate.completedAt,
        participants: debate.participants.map(p => ({
          username: p.user?.username || 'unknown',
          side: p.side,
          isAI: !!p.isAI,
        })),
      },
      turns: turns.map(turn => ({
        _id: turn._id,
        username: turn.author?.username || 'unknown',
        side: turn.side,
        round: turn.round,
        turnNumber: turn.turnNumber,
        content: turn.content,
        createdAt: turn.createdAt,
        // Scores only — the coaching attached to a turn is written for its
        // author, not for an audience.
        scores: {
          overall:   turn.aiAnalysis?.overallQuality ?? null,
          tone:      turn.aiAnalysis?.toneScore ?? null,
          clarity:   turn.aiAnalysis?.clarityScore ?? null,
          evidence:  turn.aiAnalysis?.evidenceScore ?? turn.aiAnalysis?.evidenceAnalysis?.score ?? null,
          fallacies: (turn.aiAnalysis?.fallacies || []).map(f => f.type),
        },
      })),
    },
  });
});
