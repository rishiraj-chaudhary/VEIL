import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  debate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Debate',
    index: true
  },
  
  operation: {
    type: String,
    required: true,
    enum: [
      'debate_analysis',
      'claim_extraction',
      'summary_generation',
      'live_assistant',
      'fact_check',
      'rebuttal_analysis',
      'fallacy_detection',
      'knowledge_retrieval'
    ],
    index: true
  },
  
  model: {
    type: String,
    required: true
  },
  
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
  
  estimatedCost: {
    type: Number,
    required: true,
    default: 0
  },
  
  responseTime: {
    type: Number,
    default: 0
  },
  
  cached: {
    type: Boolean,
    default: false
  },
  
  success: {
    type: Boolean,
    default: true
  },
  
  errorMessage: {
    type: String
  }
  
}, {
  timestamps: true
});

// Indexes for efficient querying
aiUsageSchema.index({ user: 1, createdAt: -1 });
aiUsageSchema.index({ debate: 1, createdAt: -1 });
aiUsageSchema.index({ operation: 1, createdAt: -1 });
aiUsageSchema.index({ createdAt: -1 });

// Static method: Get user's daily usage
aiUsageSchema.statics.getDailyUsage = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
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
    {
      $sort: { _id: 1 }
    }
  ]);
};

// Static method: Get operation breakdown
aiUsageSchema.statics.getOperationBreakdown = async function(userId, startDate = null, endDate = null) {
  const match = { user: new mongoose.Types.ObjectId(userId) };
  
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  
  return this.aggregate([
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
    {
      $sort: { cost: -1 }
    }
  ]);
};

// Static method: Check user budget
aiUsageSchema.statics.checkUserBudget = async function(userId, dailyBudget) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const result = await this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: today }
      }
    },
    {
      $group: {
        _id: null,
        spent: { $sum: '$estimatedCost' }
      }
    }
  ]);
  
  const spent = result.length > 0 ? result[0].spent : 0;
  const remaining = Math.max(0, dailyBudget - spent);
  const percentUsed = dailyBudget > 0 ? (spent / dailyBudget) * 100 : 0;
  
  return {
    spent,
    remaining,
    budget: dailyBudget,
    percentUsed,
    exceeded: spent >= dailyBudget
  };
};

const AIUsage = mongoose.models.AIUsage || mongoose.model('AIUsage', aiUsageSchema);

export default AIUsage;