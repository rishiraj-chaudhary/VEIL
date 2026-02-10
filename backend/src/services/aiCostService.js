import AIUsage from '../models/AIUsage.js';

class AICostService {
  // Daily budgets per tier (in USD)
  static DAILY_BUDGETS = {
    free: 0.25,      // $0.25/day
    pro: 2.00,       // $2/day
    team: 10.00,     // $10/day
    enterprise: 100.00 // $100/day
  };

  // Groq pricing (per million tokens)
  static GROQ_PRICING = {
    'llama-3.3-70b-versatile': {
      input: 0.59,
      output: 0.79
    },
    'llama-3.1-70b-versatile': {
      input: 0.59,
      output: 0.79
    },
    'llama-3.1-8b-instant': {
      input: 0.05,
      output: 0.08
    }
  };

  /**
   * Calculate cost for a Groq API call
   */
  static calculateCost(model, promptTokens, completionTokens) {
    const pricing = this.GROQ_PRICING[model];
    
    if (!pricing) {
      console.warn(`⚠️ Unknown model: ${model}, using default pricing`);
      return ((promptTokens * 0.59) + (completionTokens * 0.79)) / 1000000;
    }
    
    const inputCost = (promptTokens * pricing.input) / 1000000;
    const outputCost = (completionTokens * pricing.output) / 1000000;
    
    return inputCost + outputCost;
  }

  /**
   * Track AI usage
   */
  static async trackUsage({
    userId,
    debateId = null,
    operation,
    model,
    promptTokens,
    completionTokens,
    responseTime = 0,
    cached = false,
    success = true,
    errorMessage = null
  }) {
    try {
      const totalTokens = promptTokens + completionTokens;
      const estimatedCost = cached ? 0 : this.calculateCost(model, promptTokens, completionTokens);

      const usage = await AIUsage.create({
        user: userId,
        debate: debateId,
        operation,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost,
        responseTime,
        cached,
        success,
        errorMessage
      });

      console.log(
        `💰 AI Usage tracked: ${operation} | ${model} | ${totalTokens} tokens | $${estimatedCost.toFixed(6)}${cached ? ' (cached)' : ''}`
      );

      return usage;
    } catch (error) {
      console.error('❌ Failed to track AI usage:', error);
      return null;
    }
  }

  /**
   * Check if user can make AI request
   */
  static async canUserMakeRequest(userId, userTier = 'free') {
    try {
      const dailyBudget = this.DAILY_BUDGETS[userTier];
      const budgetStatus = await AIUsage.checkUserBudget(userId, dailyBudget);

      return {
        allowed: !budgetStatus.exceeded,
        budget: budgetStatus
      };
    } catch (error) {
      console.error('❌ Failed to check budget:', error);
      return { allowed: true, budget: null }; // Fail open
    }
  }

  /**
   * Get user's AI usage statistics
   */
  static async getUserStats(userId, startDate = null, endDate = null) {
    try {
      const match = { user: userId };
      
      if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(endDate);
      }

      const summary = await AIUsage.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalTokens: { $sum: '$totalTokens' },
            totalCost: { $sum: '$estimatedCost' },
            cachedCalls: {
              $sum: { $cond: ['$cached', 1, 0] }
            },
            avgResponseTime: { $avg: '$responseTime' },
            byOperation: {
              $push: {
                operation: '$operation',
                tokens: '$totalTokens',
                cost: '$estimatedCost'
              }
            }
          }
        }
      ]);

      const daily = await AIUsage.getDailyUsage(userId, 30);
      const byOperation = await AIUsage.getOperationBreakdown(userId, startDate, endDate);

      return {
        summary: summary[0] || {
          totalCalls: 0,
          totalTokens: 0,
          totalCost: 0,
          cachedCalls: 0,
          avgResponseTime: 0,
          byOperation: []
        },
        daily,
        byOperation
      };
    } catch (error) {
      console.error('❌ Failed to get user stats:', error);
      throw error;
    }
  }

  /**
   * Select appropriate model based on budget
   */
  static selectModelForBudget(userTier, budgetStatus) {
    // If budget exceeded, use cheapest model
    if (budgetStatus.exceeded) {
      return 'llama-3.1-8b-instant';
    }

    // If approaching budget limit (>80%), use cheaper model
    if (budgetStatus.percentUsed > 80) {
      return 'llama-3.1-70b-versatile';
    }

    // Default: use best model
    return 'llama-3.3-70b-versatile';
  }
}

export default AICostService;