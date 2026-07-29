import sparringAgent from '../services/agent/sparringAgent.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

/**
 * Run a sparring session against a draft argument.
 *
 * The agent is expensive by design — it makes several model calls per run — so
 * the route sits behind the AI rate limiter and the daily budget middleware, and
 * the agent enforces its own hard cap on top of those.
 */
export const runSparringSession = asyncHandler(async (req, res) => {
  const { topic, side, draft } = req.body;
  const userId = req.user.id;
  const tier = req.user?.subscription?.tier || 'free';

  // Free users get a smaller session. The cap is what makes this affordable to
  // offer at all on a shared daily token budget.
  const limits = tier === 'free'
    ? { maxLlmCalls: 8, maxClaims: 3, maxRepairs: 2 }
    : { maxLlmCalls: 14, maxClaims: 5, maxRepairs: 4 };

  const result = await sparringAgent.run({
    userId,
    topic,
    side,
    draft,
    userTier: tier,
    limits,
  });

  logger.info('sparring session', {
    userId,
    ok: result.ok,
    claimsTested: result.summary?.claimsTested,
    llmCalls: result.summary?.llmCalls,
    durationMs: result.summary?.durationMs,
  });

  if (!result.ok) {
    return res.status(503).json({
      success: false,
      message: 'The sparring agent could not complete this session. Please try again.',
    });
  }

  res.json({ success: true, data: result });
});

export default { runSparringSession };
