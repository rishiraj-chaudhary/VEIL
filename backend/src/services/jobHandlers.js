import Huddle from '../models/Huddle.js';
import logger from '../utils/logger.js';
import { respondAsAIIfNeeded } from './aiTurnOrchestrator.js';
import huddleAIService from './huddleAIService.js';
import jobQueue from './jobQueue.js';
import refutationDetectionService from './refutationDetectionService.js';

/**
 * Registers every background job type.
 *
 * Kept separate from the queue itself so the queue has no knowledge of the
 * domain, and separate from the services so importing a service does not drag
 * the queue in — several of these services import each other.
 */

export const JOB_TYPES = {
  AI_OPPONENT_TURN: 'ai-opponent-turn',
  DETECT_REFUTATIONS: 'detect-refutations',
  SUMMARISE_HUDDLE: 'summarise-huddle',
  SCORE_DEBATE: 'score-debate',
};

export const registerJobHandlers = () => {
  /** The AI's reply in a practice debate. */
  jobQueue.register(JOB_TYPES.AI_OPPONENT_TURN, async ({ debateId }) => {
    await respondAsAIIfNeeded(debateId);
  });

  /** Which of the opponent's claims a turn refuted — feeds argument reputation. */
  jobQueue.register(JOB_TYPES.DETECT_REFUTATIONS, async (payload) => {
    await refutationDetectionService.processTurn(payload);
  });

  /** Post-call huddle summary and generated post draft. */
  jobQueue.register(JOB_TYPES.SUMMARISE_HUDDLE, async ({ huddleId }) => {
    const huddle = await Huddle.findById(huddleId)
      .populate('host', 'username')
      .populate('guest', 'username');

    if (!huddle) throw new Error(`Huddle ${huddleId} no longer exists`);
    if (!huddle.transcript?.length) return;

    const analysis = await huddleAIService.analyseHuddle(huddle.transcript, {
      hostUsername:  huddle.host?.username || 'Host',
      guestUsername: huddle.guest?.username || 'Guest',
      duration:      huddle.duration,
    });

    await Huddle.findByIdAndUpdate(huddleId, { aiSummary: analysis });
    logger.info('huddle summarised', { huddleId });
  });

  /**
   * Final scoring and winner determination.
   *
   * The most important job to make durable: if this is lost, a completed debate
   * never gets a verdict and both participants' records stay unresolved, with
   * nothing anywhere indicating that scoring was owed.
   */
  jobQueue.register(JOB_TYPES.SCORE_DEBATE, async ({ debateId }) => {
    const Debate = (await import('../models/debate.js')).default;
    const DebateTurn = (await import('../models/debateTurn.js')).default;
    const debateScoringService = (await import('./debateScoringService.js')).default;
    const debateAIService = (await import('./debateAIService.js')).default;

    const score = await debateScoringService.calculateFinalScore(debateId);

    const debate = await Debate.findById(debateId);
    if (!debate) throw new Error(`Debate ${debateId} no longer exists`);

    debate.winner = score.winner;
    debate.finalScores = {
      for:     score.scores?.for?.total ?? 0,
      against: score.scores?.against?.total ?? 0,
    };

    // The written summary of the debate.
    //
    // This was previously produced by a `completeDebate` controller action that
    // no route mounted, so it never ran for any debate. Generating it here ties
    // it to the event it describes, and puts it behind the queue's retries —
    // a summary is worth one more attempt, but never worth failing the scoring
    // that participants are waiting on, hence the catch.
    if (!debate.aiSummary) {
      try {
        const turns = await DebateTurn.find({ debate: debateId }).sort({ turnNumber: 1 }).lean();

        debate.aiSummary = await debateAIService.generateDebateSummary(
          debateId,
          turns.filter(t => t.side === 'for'),
          turns.filter(t => t.side === 'against'),
          null,
          'free',
        );
      } catch (error) {
        logger.warn('debate summary generation failed', { debateId, error: error.message });
      }
    }

    await debate.save();

    logger.info('debate scored', {
      debateId,
      winner: score.winner,
      for: debate.finalScores.for,
      against: debate.finalScores.against,
    });
  });

  logger.info('job handlers registered', { types: Object.values(JOB_TYPES) });
};

export default registerJobHandlers;
