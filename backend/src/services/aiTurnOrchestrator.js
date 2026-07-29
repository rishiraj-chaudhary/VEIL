import Debate from '../models/debate.js';
import { getIO } from '../sockets/index.js';
import aiOpponentService from './aiOpponentService.js';
import debateTurnService from './debateTurnService.js';

/**
 * Bridges the AI opponent and the turn pipeline.
 *
 * Kept in its own module because aiOpponentService generates turns and
 * debateTurnService submits them — having either import the other would create a
 * cycle. Both controllers call this so there is one implementation of "is it the
 * AI's move, and if so, play it".
 */

// Prevents two concurrent submissions racing to generate the same AI reply.
const inFlight = new Set();

export const respondAsAIIfNeeded = async (debateId) => {
  const key = debateId.toString();
  if (inFlight.has(key)) return null;

  inFlight.add(key);
  try {
    const debate = await Debate.findById(debateId).populate('participants.user', 'username');
    if (!debate || debate.status !== 'active') return null;

    const aiParticipant = aiOpponentService.getAIParticipant(debate);
    if (!aiParticipant) return null;

    const aiUserId = aiParticipant.user?._id ?? aiParticipant.user;

    const eligibility = await debateTurnService.canSubmitTurn(debateId, aiUserId);
    if (!eligibility?.canSubmit) return null;

    const roundNumber = eligibility.round ?? debate.currentRound ?? 1;
    const roundType = debate.rounds?.find(r => r.number === roundNumber)?.type ?? 'rebuttal';

    const content = await aiOpponentService.generateTurn(debate, { round: roundNumber, roundType });
    if (!content?.trim()) return null;

    const result = await debateTurnService.submitDebateTurn(debateId, aiUserId, content);

    // The turn is already persisted; a missing socket layer (scripts, tests,
    // startup races) must not be reported as the AI having failed to reply.
    try {
      const io = getIO();
      const payload = { debateId, turn: result?.turn ?? null };

      // `turn-submitted` is what the debate room already listens on, so the AI's
      // reply refreshes the page the same way a human's does. Submitting through
      // the service alone emits nothing — that is why the AI's turn previously
      // landed in the database while the UI sat on "Waiting for Opponent".
      io.to(`debate-${debateId}`).emit('turn-submitted', payload);
      io.to(`debate-${debateId}`).emit('ai-turn-submitted', payload);
    } catch {
      console.warn('AI turn saved but not broadcast — socket layer unavailable');
    }

    console.log(`🤖 AI opponent replied in debate ${debateId} (round ${roundNumber} ${roundType})`);
    return result;

  } catch (error) {
    console.error('AI opponent turn failed:', error.message);
    return null;
  } finally {
    inFlight.delete(key);
  }
};

export default { respondAsAIIfNeeded };
