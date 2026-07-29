import AICostService from '../services/aiCostService.js';
import logger from '../utils/logger.js';

/**
 * Daily spend cap for AI-backed routes.
 *
 * `AICostService.canUserMakeRequest` and `selectModelForBudget` existed but were
 * never called from anywhere, so the per-tier daily budgets were decorative —
 * nothing stopped a single user from spending without limit. This is the
 * enforcement point.
 *
 * Denials return 429 with the numbers attached, so a client can show what the
 * limit is rather than a bare rejection.
 */
export const enforceAIBudget = async (req, res, next) => {
  const userId = req.user?._id;
  if (!userId) return next();

  // Disabled by default in development so local work is not throttled.
  if (process.env.AI_BUDGET_ENFORCED !== 'true') return next();

  try {
    const tier = req.user?.subscription?.tier || 'free';
    const { allowed, budget } = await AICostService.canUserMakeRequest(userId, tier);

    // Downstream calls can consult this to pick a cheaper model as the cap nears.
    req.aiBudget = budget;

    if (!allowed) {
      logger.warn('AI budget exceeded', {
        userId: userId.toString(),
        tier,
        spent: budget?.spent,
        limit: budget?.budget,
      });

      return res.status(429).json({
        success: false,
        message: "You've reached today's AI usage limit. It resets at midnight UTC.",
        data: {
          spent: Number((budget?.spent ?? 0).toFixed(4)),
          limit: budget?.budget ?? null,
          tier,
        },
      });
    }

    next();
  } catch (error) {
    // Failing open is deliberate: a tracking outage should not block the product.
    logger.error('AI budget check failed, allowing request', { error: error.message });
    next();
  }
};

export default enforceAIBudget;
