import mongoose from 'mongoose';

/**
 * AI DEBATE COACH - USER PERFORMANCE MODEL
 *
 * Tracks user's debate performance over time.
 * Updated (Step 11): adds skillProfile, performanceTrend,
 * peerPercentiles, blindSpots, personaAligned, and skillProfile
 * inside snapshots.
 */

const userPerformanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },

  // ── Overall statistics ─────────────────────────────────────────────────
  stats: {
    totalDebates: { type: Number, default: 0 },
    totalTurns:   { type: Number, default: 0 },
    wins:         { type: Number, default: 0 },
    losses:       { type: Number, default: 0 },
    draws:        { type: Number, default: 0 },
    winRate:      { type: Number, default: 0 },
  },

  // ── Quality metrics (rolling averages) ────────────────────────────────
  qualityMetrics: {
    avgToneScore:      { type: Number, default: 0 },
    avgClarityScore:   { type: Number, default: 0 },
    avgEvidenceScore:  { type: Number, default: 0 },
    avgOverallQuality: { type: Number, default: 0 },
  },

  // ── Fallacy tracking ───────────────────────────────────────────────────
  fallacyStats: {
    totalFallacies: { type: Number, default: 0 },
    fallacyRate:    { type: Number, default: 0 },
    commonFallacies: [{
      type:  { type: String },
      count: { type: Number },
    }],
  },

  // ── Historical snapshots ───────────────────────────────────────────────
  snapshots: [{
    date:            { type: Date, default: Date.now },
    period:          { type: String, enum: ['week', 'month', 'all-time', 'post-debate', 'milestone'] },
    debatesInPeriod: Number,
    avgToneScore:    Number,
    avgClarityScore: Number,
    avgEvidenceScore: Number,
    fallacyRate:     Number,
    winRate:         Number,
    // ── NEW (Step 11): skill profile snapshot ──────────────────────────
    skillProfile: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  }],

  // ── Strengths & Weaknesses + blind spots ──────────────────────────────
  analysis: {
    strengths: [{
      area:        String,
      description: String,
      score:       Number,
    }],
    weaknesses: [{
      area:           String,
      description:    String,
      score:          Number,
      improvementTip: String,
    }],
    lastAnalyzed: { type: Date, default: Date.now },

    // ── NEW (Step 11): persona × skill gap analysis ──────────────────
    blindSpots: [{
      trait:      String,
      traitValue: mongoose.Schema.Types.Mixed,
      skill:      String,
      skillScore: Number,
      insight:    String,
    }],
    personaAligned: [{
      trait:   String,
      skill:   String,
      message: String,
    }],
  },

  // ── Improvement tracking ───────────────────────────────────────────────
  improvement: {
    toneImprovement:     Number,
    clarityImprovement:  Number,
    evidenceImprovement: Number,
    fallacyReduction:    Number,
    overallGrowth:       Number,
    velocity: String, // 'rapid' | 'steady' | 'slow' | 'declining'
  },

  // ── Achievements ───────────────────────────────────────────────────────
  achievements: [{
    id:          String,
    name:        String,
    description: String,
    earnedAt:    { type: Date, default: Date.now },
    icon:        String,
  }],

  // ── Coaching tips ──────────────────────────────────────────────────────
  coachingTips: [{
    category:   String,
    priority:   { type: String, enum: ['high', 'medium', 'low'] },
    message:    String,
    actionable: String,
    source:     { type: String, default: 'rule' }, // 'rule' | 'performanceGraph'
    createdAt:  { type: Date, default: Date.now },
    dismissed:  { type: Boolean, default: false },
  }],

  // ── Style profile ──────────────────────────────────────────────────────
  styleProfile: {
    preferredSide:     String,
    avgArgumentLength: Number,
    emotionalTone:     String,
    evidenceReliance:  String,
    debateFrequency:   String,
    topTopics:         [String],
  },

  // ── NEW (Step 11): 6-dimension skill profile ───────────────────────────
  skillProfile: {
    argumentation:    { type: Number, default: 0 },
    evidenceUse:      { type: Number, default: 0 },
    toneControl:      { type: Number, default: 0 },
    clarity:          { type: Number, default: 0 },
    rebuttalStrength: { type: Number, default: 0 },
    fallacyAvoidance: { type: Number, default: 0 },
  },

  // ── NEW (Step 11): longitudinal trend ─────────────────────────────────
  performanceTrend: {
    type: String,
    enum: ['improving', 'plateau', 'declining', 'inconsistent', 'stable', 'new'],
    default: 'new',
  },

  // ── NEW (Step 11): peer percentiles per skill ──────────────────────────
  peerPercentiles: {
    argumentation:    { type: Number, default: null },
    evidenceUse:      { type: Number, default: null },
    toneControl:      { type: Number, default: null },
    clarity:          { type: Number, default: null },
    rebuttalStrength: { type: Number, default: null },
    fallacyAvoidance: { type: Number, default: null },
  },

  lastUpdated: { type: Date, default: Date.now },
  createdAt:   { type: Date, default: Date.now },
});

// ── Indexes ────────────────────────────────────────────────────────────────
userPerformanceSchema.index({ user: 1 });
userPerformanceSchema.index({ 'stats.winRate': -1 });
userPerformanceSchema.index({ 'qualityMetrics.avgOverallQuality': -1 });
userPerformanceSchema.index({ lastUpdated: -1 });
userPerformanceSchema.index({ 'skillProfile.argumentation': -1 });
userPerformanceSchema.index({ performanceTrend: 1 });

// ── Pre-save ───────────────────────────────────────────────────────────────
userPerformanceSchema.pre('save', function (next) {
  this.lastUpdated = new Date();
  next();
});

// ── Virtual: rank ──────────────────────────────────────────────────────────
userPerformanceSchema.virtual('rank').get(function () {
  if (this.stats.totalDebates < 5) return 'Novice';
  if (this.stats.winRate >= 70) return 'Master';
  if (this.stats.winRate >= 60) return 'Expert';
  if (this.stats.winRate >= 50) return 'Skilled';
  if (this.stats.winRate >= 40) return 'Intermediate';
  return 'Beginner';
});

// ── Methods ────────────────────────────────────────────────────────────────

userPerformanceSchema.methods.addSnapshot = async function (type = 'milestone') {
  this.snapshots.push({
    date:             new Date(),
    period:           type,
    debatesInPeriod:  this.stats.totalDebates,
    avgToneScore:     this.qualityMetrics.avgToneScore,
    avgClarityScore:  this.qualityMetrics.avgClarityScore,
    avgEvidenceScore: this.qualityMetrics.avgEvidenceScore,
    fallacyRate:      this.fallacyStats.fallacyRate,
    winRate:          this.stats.winRate,
    skillProfile:     this.skillProfile ? { ...this.skillProfile.toObject?.() ?? this.skillProfile } : null,
  });

  if (this.snapshots.length > 52) {
    this.snapshots = this.snapshots.slice(-52);
  }

  return this.save();
};

userPerformanceSchema.methods.awardAchievement = async function (achievement) {
  const exists = this.achievements.find(a => a.id === achievement.id);
  if (!exists) {
    this.achievements.push(achievement);
    await this.save();
    return true;
  }
  return false;
};

userPerformanceSchema.methods.addCoachingTip = async function (tip) {
  const existingSimilar = this.coachingTips.find(
    t => t.category === tip.category && t.source === (tip.source || 'rule') && !t.dismissed
  );

  if (!existingSimilar) {
    this.coachingTips.unshift(tip);
    if (this.coachingTips.length > 15) {
      this.coachingTips = this.coachingTips.slice(0, 15);
    }
    return this.save();
  }

  return this;
};

userPerformanceSchema.methods.updateRankTier = function () {
  const { totalDebates, winRate } = this.stats;
  const avgQuality = this.qualityMetrics.avgOverallQuality || 0;
  const { fallacyRate } = this.fallacyStats;

  const compositeScore =
    winRate * 0.3 +
    avgQuality * 0.4 +
    (1 - fallacyRate) * 100 * 0.3;

  if (totalDebates < 5)                              this.rank = 'novice';
  else if (totalDebates >= 50 && compositeScore >= 85) this.rank = 'legend';
  else if (totalDebates >= 30 && compositeScore >= 75) this.rank = 'master';
  else if (totalDebates >= 15 && compositeScore >= 65) this.rank = 'expert';
  else if (totalDebates >= 5  && compositeScore >= 50) this.rank = 'apprentice';
  else                                               this.rank = 'novice';

  return this.rank;
};

// ── Statics ────────────────────────────────────────────────────────────────

userPerformanceSchema.statics.getLeaderboard = async function (limit = 10, metric = 'winRate') {
  const sortField = `stats.${metric}`;
  return this.find({ 'stats.totalTurns': { $gte: 1 } })
    .populate('user', 'username')
    .sort({ [sortField]: -1 })
    .limit(limit);
};

userPerformanceSchema.statics.getTopImprovers = async function (limit = 10) {
  return this.find({ 'stats.totalTurns': { $gte: 1 } })
    .populate('user', 'username')
    .sort({ 'improvement.overallGrowth': -1 })
    .limit(limit);
};

userPerformanceSchema.statics.getCategoryLeaders = async function (category, limit = 5) {
  const categoryMap = {
    tone:     'qualityMetrics.avgToneScore',
    clarity:  'qualityMetrics.avgClarityScore',
    evidence: 'qualityMetrics.avgEvidenceScore',
    logic:    'fallacyStats.fallacyRate',
  };

  const sortField = categoryMap[category];
  if (!sortField) return [];

  const sortOrder = category === 'logic' ? 1 : -1;

  return this.find({ 'stats.totalTurns': { $gte: 1 } })
    .populate('user', 'username')
    .sort({ [sortField]: sortOrder })
    .limit(limit);
};

userPerformanceSchema.statics.getUserRankPosition = async function (userId) {
  const allUsers = await this.find({ 'stats.totalTurns': { $gte: 1 } })
    .sort({ 'stats.winRate': -1 })
    .select('user stats.winRate');

  const position = allUsers.findIndex(p => p.user.equals(userId));

  return {
    position:       position + 1,
    totalQualified: allUsers.length,
    percentile:     position >= 0 ? Math.round((1 - position / allUsers.length) * 100) : 0,
  };
};

const UserPerformance = mongoose.model('UserPerformance', userPerformanceSchema);
export default UserPerformance;