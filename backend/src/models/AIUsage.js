import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // What operation was performed
  operation: {
    type: String,
    required: true,
    enum: [
      'debate_analysis',      // Analyzing a debate turn
      'claim_extraction',     // Extracting claims
      'fact_check',          // Fact checking
      'live_assistant',      // Live debate assistant
      'persona_analysis',    // Persona drift detection
      'summary_generation',  // Generating summaries
      'coach_insight',       // AI coach feedback
      'image_generation',    // AI image generation (if you add this)
      'other'
    ],
    index: true
  },
  
  // Which model was used
  model: {
    type: String,
    required: true,
    enum: [
      'llama-3.3-70b-versatile',      // Grok fast (cheap)
      'llama-3.1-70b-versatile',      // Grok smart (expensive)
      'claude-3-5-sonnet-20241022',   // Claude (very expensive)
      'gpt-4o',                        // GPT-4o (expensive)
      'cached'                         // Cached response (free)
    ],
    index: true
  },
  
  // Token usage
  promptTokens: {
    type: Number,
    required: true,
    default: 0
  },
  
  completionTokens: {
    type: Number,
    required: true,
    default: 0
  },
  
  totalTokens: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Cost estimation (in USD)
  estimatedCost: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Response metadata
  responseTime: {
    type: Number, // milliseconds
    default: 0
  },
  
  cached: {
    type: Boolean,
    default: false
  },
  
  // Context
  debate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Debate'
  },
  
  turn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DebateTurn'
  },
  
  // Error tracking
  error: {
    type: String,
    default: null
  },
  
  success: {
    type: Boolean,
    default: true
  }
  
}, {
  timestamps: true
});

// Indexes for efficient querying
aiUsageSchema.index({ user: 1, createdAt: -1 });
aiUsageSchema.index({ user: 1, operation: 1 });
aiUsageSchema.index({ createdAt: -1 });
aiUsageSchema.index({ model: 1, createdAt: -1 });

// Static method: Get user's usage stats
aiUsageSchema.statics.getUserStats = async function(userId, startDate, endDate) {
  const match = { user: userId };
  
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  
  const stats = await this.aggregate([
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
  
  return stats[0] || {
    totalCalls: 0,
    totalTokens: 0,
    totalCost: 0,
    cachedCalls: 0,
    avgResponseTime: 0,
    byOperation: []
  };
};

// Static method: Get daily usage breakdown
aiUsageSchema.statics.getDailyUsage = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const dailyStats = await this.aggregate([
    {
      $match: {
        user: userId,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        calls: { $sum: 1 },
        tokens: { $sum: '$totalTokens' },
        cost: { $sum: '$estimatedCost' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  return dailyStats;
};

// Static method: Get operation breakdown
aiUsageSchema.statics.getOperationBreakdown = async function(userId, startDate, endDate) {
  const match = { user: userId };
  
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  
  const breakdown = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$operation',
        calls: { $sum: 1 },
        tokens: { $sum: '$totalTokens' },
        cost: { $sum: '$estimatedCost' },
        avgResponseTime: { $avg: '$responseTime' }
      }
    },
    { $sort: { cost: -1 } }
  ]);
  
  return breakdown;
};

// Static method: Check if user exceeded budget
aiUsageSchema.statics.checkUserBudget = async function(userId, dailyBudget = 1.00) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayUsage = await this.aggregate([
    {
      $match: {
        user: userId,
        createdAt: { $gte: today }
      }
    },
    {
      $group: {
        _id: null,
        totalCost: { $sum: '$estimatedCost' }
      }
    }
  ]);
  
  const spent = todayUsage[0]?.totalCost || 0;
  const remaining = dailyBudget - spent;
  const percentUsed = (spent / dailyBudget) * 100;
  
  return {
    spent,
    remaining,
    budget: dailyBudget,
    percentUsed,
    exceeded: spent >= dailyBudget
  };
};

const AIUsage = mongoose.model('AIUsage', aiUsageSchema);

export default AIUsage;