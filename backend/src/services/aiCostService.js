import AIUsage from '../models/AIUsage.js';

/**
 * AI COST GOVERNANCE SERVICE
 * 
 * Tracks AI usage, calculates costs, and enforces budgets
 */
class AICostService {
  
  // Pricing per 1M tokens (update these based on actual pricing)
  static PRICING = {
    'llama-3.3-70b-versatile': {
      input: 0.59,    // $0.59 per 1M input tokens
      output: 0.79    // $0.79 per 1M output tokens
    },
    'llama-3.1-70b-versatile': {
      input: 0.59,
      output: 0.79
    },
    'claude-3-5-sonnet-20241022': {
      input: 3.00,    // $3.00 per 1M input tokens
      output: 15.00   // $15.00 per 1M output tokens
    },
    'gpt-4o': {
      input: 2.50,
      output: 10.00
    },
    'cached': {
      input: 0,
      output: 0
    }
  };
  
  // Daily budget per user tier (in USD)
  static DAILY_BUDGETS = {
    free: 0.25,        // $0.25/day = ~$7.50/month
    pro: 2.00,         // $2.00/day = ~$60/month
    team: 10.00,       // $10.00/day = ~$300/month
    enterprise: 100.00 // $100/day = ~$3000/month
  };
  
  /**
   * Calculate cost for a given token usage
   */
  static calculateCost(model, promptTokens, completionTokens) {
    const pricing = this.PRICING[model];
    
    if (!pricing) {
      console.warn(`⚠️ Unknown model pricing: ${model}`);
      return 0;
    }
    
    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;
    
    return inputCost + outputCost;
  }
  
  /**
   * Track an AI usage event
   */
  static async trackUsage({
    userId,
    operation,
    model,
    promptTokens,
    completionTokens,
    responseTime,
    cached = false,
    debateId = null,
    turnId = null,
    error = null
  }) {
    try {
      const totalTokens = promptTokens + completionTokens;
      const estimatedCost = cached ? 0 : this.calculateCost(model, promptTokens, completionTokens);
      
      const usage = await AIUsage.create({
        user: userId,
        operation,
        model: cached ? 'cached' : model,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost,
        responseTime,
        cached,
        debate: debateId,
        turn: turnId,
        error,
        success: !error
      });
      
      console.log(`💰 AI Usage tracked: ${operation} | ${model} | ${totalTokens} tokens | $${estimatedCost.toFixed(4)}`);
      
      return usage;
      
    } catch (error) {
      console.error('❌ Error tracking AI usage:', error);
      // Don't throw - tracking failures shouldn't break the app
      return null;
    }
  }
  
  /**
   * Check if user can make AI request (budget check)
   */
  static async canUserMakeRequest(userId, userTier = 'free') {
    try {
      const budget = await AIUsage.checkUserBudget(
        userId,
        this.DAILY_BUDGETS[userTier]
      );
      
      return {
        allowed: !budget.exceeded,
        budget
      };
      
    } catch (error) {
      console.error('Error checking user budget:', error);
      // On error, allow the request (fail open)
      return { allowed: true, budget: null };
    }
  }
  
  /**
   * Get recommended model based on budget
   */
  static async getRecommendedModel(userId, userTier = 'free', preferredModel = 'llama-3.3-70b-versatile') {
    const { allowed, budget } = await this.canUserMakeRequest(userId, userTier);
    
    if (!allowed) {
      // Budget exceeded - use cheapest model
      return {
        model: 'llama-3.3-70b-versatile',
        reason: 'budget_exceeded',
        budget
      };
    }
    
    // Check budget percentage
    if (budget.percentUsed > 80) {
      // Over 80% - switch to cheap model
      return {
        model: 'llama-3.3-70b-versatile',
        reason: 'budget_warning',
        budget
      };
    }
    
    if (budget.percentUsed > 50) {
      // Over 50% - use medium model
      return {
        model: 'llama-3.3-70b-versatile',
        reason: 'budget_moderate',
        budget
      };
    }
    
    // Under 50% - use preferred model
    return {
      model: preferredModel,
      reason: 'budget_ok',
      budget
    };
  }
  
  /**
   * Get user usage stats
   */
  static async getUserStats(userId, startDate = null, endDate = null) {
    const stats = await AIUsage.getUserStats(userId, startDate, endDate);
    const dailyUsage = await AIUsage.getDailyUsage(userId, 30);
    const breakdown = await AIUsage.getOperationBreakdown(userId, startDate, endDate);
    
    return {
      summary: stats,
      daily: dailyUsage,
      byOperation: breakdown
    };
  }
  
  /**
   * Get platform-wide stats (admin only)
   */
  static async getPlatformStats(startDate = null, endDate = null) {
    const match = {};
    
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }
    
    const stats = await AIUsage.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          totalTokens: { $sum: '$totalTokens' },
          totalCost: { $sum: '$estimatedCost' },
          uniqueUsers: { $addToSet: '$user' },
          cachedCalls: { $sum: { $cond: ['$cached', 1, 0] } },
          avgResponseTime: { $avg: '$responseTime' }
        }
      }
    ]);
    
    const result = stats[0] || {
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      uniqueUsers: [],
      cachedCalls: 0,
      avgResponseTime: 0
    };
    
    result.uniqueUserCount = result.uniqueUsers.length;
    delete result.uniqueUsers;
    
    return result;
  }
}

export default AICostService;