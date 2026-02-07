import mongoose from 'mongoose';

/**
 * AI DEBATE COACH - USER PERFORMANCE MODEL
 * 
 * Tracks user's debate performance over time
 * Enables personalized coaching and improvement tracking
 */


const userPerformanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // Overall statistics
  stats: {
    totalDebates: {
      type: Number,
      default: 0
    },
    totalTurns: {
      type: Number,
      default: 0
    },
    wins: {
      type: Number,
      default: 0
    },
    losses: {
      type: Number,
      default: 0
    },
    draws: {
      type: Number,
      default: 0
    },
    winRate: {
      type: Number,
      default: 0
    }
  },

  // Quality metrics (averages)
  qualityMetrics: {
    avgToneScore: {
      type: Number,
      default: 0
    },
    avgClarityScore: {
      type: Number,
      default: 0
    },
    avgEvidenceScore: {
      type: Number,
      default: 0
    },
    avgOverallQuality: {
      type: Number,
      default: 0
    }
  },

  // Fallacy tracking
  fallacyStats: {
    totalFallacies: {
      type: Number,
      default: 0
    },
    fallacyRate: {
      type: Number,
      default: 0
    }, // fallacies per turn
    commonFallacies: [{
      type: {
        type: String
      },
      count: {
        type: Number
      }
    }]
  },

  // Historical snapshots (for tracking improvement)
  snapshots: [{
    date: {
      type: Date,
      default: Date.now
    },
    period: {
      type: String,
      enum: ['week', 'month', 'all-time']
    },
    debatesInPeriod: Number,
    avgToneScore: Number,
    avgClarityScore: Number,
    avgEvidenceScore: Number,
    fallacyRate: Number,
    winRate: Number
  }],

  // Strengths & Weaknesses
  analysis: {
    strengths: [{
      area: String, // 'evidence', 'tone', 'clarity', 'logic'
      description: String,
      score: Number
    }],
    weaknesses: [{
      area: String,
      description: String,
      score: Number,
      improvementTip: String
    }],
    lastAnalyzed: {
      type: Date,
      default: Date.now
    }
  },

  // Improvement tracking
  improvement: {
    toneImprovement: Number, // % change from start
    clarityImprovement: Number,
    evidenceImprovement: Number,
    fallacyReduction: Number,
    overallGrowth: Number,
    velocity: String // 'rapid', 'steady', 'slow', 'declining'
  },

  // Achievements
  achievements: [{
    id: String,
    name: String,
    description: String,
    earnedAt: {
      type: Date,
      default: Date.now
    },
    icon: String
  }],

  // Personalized coaching tips
  coachingTips: [{
    category: String, // 'evidence', 'tone', 'logic', 'style'
    priority: {
      type: String,
      enum: ['high', 'medium', 'low']
    },
    message: String,
    actionable: String, // specific action to take
    createdAt: {
      type: Date,
      default: Date.now
    },
    dismissed: {
      type: Boolean,
      default: false
    }
  }],

  // Debate style profile
  styleProfile: {
    preferredSide: String, // 'for', 'against', 'balanced'
    avgArgumentLength: Number,
    emotionalTone: String, // 'passionate', 'neutral', 'analytical'
    evidenceReliance: String, // 'high', 'medium', 'low'
    debateFrequency: String, // 'daily', 'weekly', 'monthly'
    topTopics: [String]
  },

  // Last updated
  lastUpdated: {
    type: Date,
    default: Date.now
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
userPerformanceSchema.index({ user: 1 });
userPerformanceSchema.index({ 'stats.winRate': -1 });
userPerformanceSchema.index({ 'qualityMetrics.avgOverallQuality': -1 });
userPerformanceSchema.index({ lastUpdated: -1 });

// Update timestamp on save
userPerformanceSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Virtual for rank (based on win rate)
userPerformanceSchema.virtual('rank').get(function() {
  if (this.stats.totalDebates < 5) return 'Novice';
  if (this.stats.winRate >= 70) return 'Master';
  if (this.stats.winRate >= 60) return 'Expert';
  if (this.stats.winRate >= 50) return 'Skilled';
  if (this.stats.winRate >= 40) return 'Intermediate';
  return 'Beginner';
});

// Method to add a snapshot
userPerformanceSchema.methods.addSnapshot = async function(period) {
  this.snapshots.push({
    date: new Date(),
    period,
    debatesInPeriod: this.stats.totalDebates,
    avgToneScore: this.qualityMetrics.avgToneScore,
    avgClarityScore: this.qualityMetrics.avgClarityScore,
    avgEvidenceScore: this.qualityMetrics.avgEvidenceScore,
    fallacyRate: this.fallacyStats.fallacyRate,
    winRate: this.stats.winRate
  });

  // Keep only last 52 snapshots (1 year of weekly data)
  if (this.snapshots.length > 52) {
    this.snapshots = this.snapshots.slice(-52);
  }

  await this.save();
};

// Method to add achievement
userPerformanceSchema.methods.awardAchievement = async function(achievement) {
  // Check if already earned
  const exists = this.achievements.find(a => a.id === achievement.id);
  if (!exists) {
    this.achievements.push(achievement);
    await this.save();
    return true;
  }
  return false;
};

// Method to add coaching tip
userPerformanceSchema.methods.addCoachingTip = async function(tip) {
  // Remove old tips of same category
  this.coachingTips = this.coachingTips.filter(
    t => t.category !== tip.category || !t.dismissed
  );

  this.coachingTips.push(tip);

  // Keep only last 10 tips
  if (this.coachingTips.length > 10) {
    this.coachingTips = this.coachingTips.slice(-10);
  }

  await this.save();
};

// Static method to get leaderboard
userPerformanceSchema.statics.getLeaderboard = async function(limit = 10) {
  return this.find({ 'stats.totalDebates': { $gte: 5 } })
    .sort({ 'stats.winRate': -1, 'stats.totalDebates': -1 })
    .limit(limit)
    .populate('user', 'username');
};

// Static method to get top improvers
userPerformanceSchema.statics.getTopImprovers = async function(limit = 10) {
  return this.find({ 'stats.totalDebates': { $gte: 3 } })
    .sort({ 'improvement.overallGrowth': -1 })
    .limit(limit)
    .populate('user', 'username');
};

// Add these static methods before export

/**
 * Get leaderboard by metric
 */
userPerformanceSchema.statics.getLeaderboard = async function(limit = 10, metric = 'winRate') {
  const sortField = `stats.${metric}`;
  
  return this.find({ 
    'stats.totalDebates': { $gte: 3 } // Minimum 3 debates to qualify
  })
    .populate('user', 'username')
    .sort({ [sortField]: -1 })
    .limit(limit);
};

/**
 * Get top improvers
 */
userPerformanceSchema.statics.getTopImprovers = async function(limit = 10) {
  return this.find({
    'stats.totalDebates': { $gte: 5 },
    'improvement.velocity': { $in: ['rapid', 'steady'] }
  })
    .populate('user', 'username')
    .sort({ 'improvement.overallGrowth': -1 })
    .limit(limit);
};

/**
 * Get category leaders
 */
userPerformanceSchema.statics.getCategoryLeaders = async function(category, limit = 5) {
  const categoryMap = {
    tone: 'qualityMetrics.avgToneScore',
    clarity: 'qualityMetrics.avgClarityScore',
    evidence: 'qualityMetrics.avgEvidenceScore',
    logic: 'fallacyStats.fallacyRate' // Lower is better
  };

  const sortField = categoryMap[category];
  if (!sortField) return [];

  const sortOrder = category === 'logic' ? 1 : -1; // Ascending for logic (lower fallacy rate is better)

  return this.find({ 
    'stats.totalDebates': { $gte: 3 } 
  })
    .populate('user', 'username')
    .sort({ [sortField]: sortOrder })
    .limit(limit);
};

/**
 * Get user's rank position
 */
userPerformanceSchema.statics.getUserRankPosition = async function(userId) {
  const allUsers = await this.find({ 
    'stats.totalDebates': { $gte: 3 } 
  })
    .sort({ 'stats.winRate': -1 })
    .select('user stats.winRate');

  const position = allUsers.findIndex(p => p.user.equals(userId));
  
  return {
    position: position + 1,
    totalQualified: allUsers.length,
    percentile: Math.round((1 - (position / allUsers.length)) * 100)
  };
};

/**
 * Update rank tier based on performance
 */
userPerformanceSchema.methods.updateRankTier = function() {
  const { totalDebates, winRate } = this.stats;
  const avgQuality = this.qualityMetrics.avgOverallQuality;
  const { fallacyRate } = this.fallacyStats;

  // Calculate composite score
  const compositeScore = (
    (winRate * 0.3) +
    (avgQuality * 0.4) +
    ((1 - fallacyRate) * 100 * 0.3)
  );

  // Assign tier based on debates and composite score
  if (totalDebates < 5) {
    this.rank = 'novice';
  } else if (totalDebates >= 50 && compositeScore >= 85) {
    this.rank = 'legend';
  } else if (totalDebates >= 30 && compositeScore >= 75) {
    this.rank = 'master';
  } else if (totalDebates >= 15 && compositeScore >= 65) {
    this.rank = 'expert';
  } else if (totalDebates >= 5 && compositeScore >= 50) {
    this.rank = 'apprentice';
  } else {
    this.rank = 'novice';
  }

  return this.rank;
};
// ============================================
// STATIC METHODS (Add before export)
// ============================================

/**
 * Get leaderboard by metric
 */
userPerformanceSchema.statics.getLeaderboard = async function(limit = 10, metric = 'winRate') {
  const sortField = `stats.${metric}`;
  
  return this.find({ 
    'stats.totalTurns': { $gte: 1 } // Changed from totalDebates to totalTurns
  })
    .populate('user', 'username')
    .sort({ [sortField]: -1 })
    .limit(limit);
};

/**
 * Get top improvers
 */
userPerformanceSchema.statics.getTopImprovers = async function(limit = 10) {
  return this.find({
    'stats.totalTurns': { $gte: 1 } // Changed from totalDebates
  })
    .populate('user', 'username')
    .sort({ 'improvement.overallGrowth': -1 })
    .limit(limit);
};

/**
 * Get category leaders
 */
userPerformanceSchema.statics.getCategoryLeaders = async function(category, limit = 5) {
  const categoryMap = {
    tone: 'qualityMetrics.avgToneScore',
    clarity: 'qualityMetrics.avgClarityScore',
    evidence: 'qualityMetrics.avgEvidenceScore',
    logic: 'fallacyStats.fallacyRate'
  };

  const sortField = categoryMap[category];
  if (!sortField) return [];

  const sortOrder = category === 'logic' ? 1 : -1; // Ascending for logic (lower fallacy rate is better)

  return this.find({ 
    'stats.totalTurns': { $gte: 1 } // Changed from totalDebates
  })
    .populate('user', 'username')
    .sort({ [sortField]: sortOrder })
    .limit(limit);
};

/**
 * Get user's rank position
 */
userPerformanceSchema.statics.getUserRankPosition = async function(userId) {
  const allUsers = await this.find({ 
    'stats.totalTurns': { $gte: 1 } // Changed from totalDebates
  })
    .sort({ 'stats.winRate': -1 })
    .select('user stats.winRate');

  const position = allUsers.findIndex(p => p.user.equals(userId));
  
  return {
    position: position + 1,
    totalQualified: allUsers.length,
    percentile: position >= 0 ? Math.round((1 - (position / allUsers.length)) * 100) : 0
  };
};

/**
 * Update rank tier based on performance
 */
userPerformanceSchema.methods.updateRankTier = function() {
  const { totalDebates, winRate } = this.stats;
  const avgQuality = this.qualityMetrics.avgOverallQuality || 0;
  const { fallacyRate } = this.fallacyStats;

  // Calculate composite score
  const compositeScore = (
    (winRate * 0.3) +
    (avgQuality * 0.4) +
    ((1 - fallacyRate) * 100 * 0.3)
  );

  // Assign tier based on debates and composite score
  if (totalDebates < 5) {
    this.rank = 'novice';
  } else if (totalDebates >= 50 && compositeScore >= 85) {
    this.rank = 'legend';
  } else if (totalDebates >= 30 && compositeScore >= 75) {
    this.rank = 'master';
  } else if (totalDebates >= 15 && compositeScore >= 65) {
    this.rank = 'expert';
  } else if (totalDebates >= 5 && compositeScore >= 50) {
    this.rank = 'apprentice';
  } else {
    this.rank = 'novice';
  }

  return this.rank;
};

// Add snapshot method
userPerformanceSchema.methods.addSnapshot = async function(type = 'milestone') {
  this.snapshots.push({
    avgToneScore: this.qualityMetrics.avgToneScore,
    avgClarityScore: this.qualityMetrics.avgClarityScore,
    avgEvidenceScore: this.qualityMetrics.avgEvidenceScore,
    fallacyRate: this.fallacyStats.fallacyRate,
    totalDebates: this.stats.totalDebates,
    type
  });
  
  // Keep only last 20 snapshots
  if (this.snapshots.length > 20) {
    this.snapshots = this.snapshots.slice(-20);
  }
  
  return this.save();
};

// Add coaching tip method
userPerformanceSchema.methods.addCoachingTip = async function(tip) {
  // Check if similar tip already exists and not dismissed
  const existingSimilar = this.coachingTips.find(
    t => t.category === tip.category && !t.dismissed
  );
  
  if (!existingSimilar) {
    this.coachingTips.unshift(tip);
    
    // Keep only last 10 tips
    if (this.coachingTips.length > 10) {
      this.coachingTips = this.coachingTips.slice(0, 10);
    }
    
    return this.save();
  }
  
  return this;
};

// Add achievement method
userPerformanceSchema.methods.awardAchievement = async function(achievement) {
  const existing = this.achievements.find(a => a.id === achievement.id);
  
  if (!existing) {
    this.achievements.push(achievement);
    await this.save();
    return true;
  }
  
  return false;
};

const UserPerformance = mongoose.model('UserPerformance', userPerformanceSchema);
export default UserPerformance;

