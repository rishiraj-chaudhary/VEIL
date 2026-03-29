/**
 * PERSONA SNAPSHOT MODEL — fixed
 * Fixes:
 *   1. significantChanges changed from [{type,description,impact}] subdoc
 *      to [mongoose.Schema.Types.Mixed] — stops Mongoose casting objects as strings
 *   2. overallDriftScore max constraint removed — service clamps to 0-100
 *
 * Place at: backend/src/models/PersonaSnapshot.js
 */

import mongoose from 'mongoose';

const personaSnapshotSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },

  personaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Persona' },

  timestamp: { type: Date, default: Date.now, index: true },

  contentSample: {
    debateTurns: [{ content: String, debateId: mongoose.Schema.Types.ObjectId, createdAt: Date }],
    comments:    [{ content: String, postId:  mongoose.Schema.Types.ObjectId, createdAt: Date }],
    posts:       [{ content: String, postId:  mongoose.Schema.Types.ObjectId, createdAt: Date }],
  },

  traits: {
    tone: {
      type:    String,
      enum:    ['analytical', 'emotional', 'sarcastic', 'supportive', 'aggressive', 'neutral', 'humorous'],
      default: 'neutral',
    },
    vocabularyComplexity: { type: Number, min: 0, max: 100, default: 50 },
    aggressiveness:       { type: Number, min: 0, max: 100, default: 50 },
    empathy:              { type: Number, min: 0, max: 100, default: 50 },
    formality:            { type: Number, min: 0, max: 100, default: 50 },
    humor:                { type: Number, min: 0, max: 100, default: 50 },
    argumentativeStyle: {
      type:    String,
      enum:    ['evidence-based', 'logical', 'emotional', 'rhetorical', 'balanced'],
      default: 'balanced',
    },
  },

  topics: {
    primary:   [String],
    emerging:  [String],
    declining: [String],
  },

  embedding: { type: [Number], default: [] },

  metrics: {
    totalDebates:      { type: Number, default: 0 },
    totalComments:     { type: Number, default: 0 },
    totalPosts:        { type: Number, default: 0 },
    totalSlicks:       { type: Number, default: 0 },
    avgDebateScore:    { type: Number, default: 0 },
    avgClarity:        { type: Number, default: 0 },
    avgTone:           { type: Number, default: 0 },
    avgResponseTime:   { type: Number, default: 0 },
    participationRate: { type: Number, default: 0 },
  },

  summary: { type: String, default: '' },

  keyChanges: [{
    trait:       String,
    direction:   { type: String, enum: ['increasing', 'decreasing', 'stable'] },
    magnitude:   Number,
    description: String,
  }],

  driftAnalysis: {
    // ── FIX 1: no max constraint — service clamps to 0-100 ──────────────────
    overallDriftScore: { type: Number, default: 0, min: 0 },

    previousSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'PersonaSnapshot' },

    cosineSimilarity: Number,

    traitChanges: [{
      trait:         String,
      oldValue:      Number,
      newValue:      Number,
      percentChange: Number,
    }],

    // ── FIX 2: Mixed instead of subdocument — prevents string cast error ─────
    significantChanges: {
      type:    [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },

  snapshotType: {
    type:    String,
    enum:    ['manual', 'automatic', 'milestone', 'scheduled'],
    default: 'automatic',
  },

  trigger: {
    type:    String,
    enum:    ['debate_count', 'time_interval', 'user_request', 'significant_change'],
    default: 'time_interval',
  },

  periodCovered: {
    startDate:    Date,
    endDate:      Date,
    durationDays: Number,
  },
}, {
  timestamps: true,
});

personaSnapshotSchema.index({ userId: 1, timestamp: -1 });
personaSnapshotSchema.index({ userId: 1, snapshotType: 1 });
personaSnapshotSchema.index({ 'driftAnalysis.overallDriftScore': -1 });

personaSnapshotSchema.methods.cosineSimilarity = function (vecA, vecB) {
  if (!vecA?.length || !vecB?.length || vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot   += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
};

personaSnapshotSchema.statics.getLatest = async function (userId) {
  return this.findOne({ userId }).sort({ timestamp: -1 });
};

personaSnapshotSchema.statics.getTimeline = async function (userId, limit = 10) {
  return this.find({ userId }).sort({ timestamp: -1 }).limit(limit).select('-embedding');
};

personaSnapshotSchema.statics.getSignificantDrifts = async function (userId, threshold = 50) {
  return this.find({ userId, 'driftAnalysis.overallDriftScore': { $gte: threshold } })
    .sort({ timestamp: -1 })
    .limit(5);
};

const PersonaSnapshot = mongoose.models.PersonaSnapshot
  || mongoose.model('PersonaSnapshot', personaSnapshotSchema);

export default PersonaSnapshot;