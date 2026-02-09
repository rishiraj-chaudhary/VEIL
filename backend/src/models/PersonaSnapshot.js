import mongoose from 'mongoose';

const personaSnapshotSchema = new mongoose.Schema({
  // Reference to user
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Reference to current Persona document (for linking)
  personaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Persona'
  },

  // Timestamp of snapshot
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },

  // ============================================
  // CONTENT SAMPLE (for re-analysis if needed)
  // ============================================
  contentSample: {
    debateTurns: [{
      content: String,
      debateId: mongoose.Schema.Types.ObjectId,
      createdAt: Date
    }],
    comments: [{
      content: String,
      postId: mongoose.Schema.Types.ObjectId,
      createdAt: Date
    }],
    posts: [{
      content: String,
      postId: mongoose.Schema.Types.ObjectId,
      createdAt: Date
    }]
  },

  // ============================================
  // EXTRACTED TRAITS (quantifiable dimensions)
  // ============================================
  traits: {
    // Communication style
    tone: {
      type: String,
      enum: ['analytical', 'emotional', 'sarcastic', 'supportive', 'aggressive', 'neutral', 'humorous'],
      default: 'neutral'
    },
    
    // Complexity metrics
    vocabularyComplexity: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    
    // Behavioral traits
    aggressiveness: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    
    empathy: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    
    formality: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    
    humor: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },

    // Debate-specific traits
    argumentativeStyle: {
      type: String,
      enum: ['evidence-based', 'logical', 'emotional', 'rhetorical', 'balanced'],
      default: 'balanced'
    }
  },

  // ============================================
  // TOPICS & INTERESTS
  // ============================================
  topics: {
    primary: [String],      // Top 5 topics discussed
    emerging: [String],     // New topics appearing
    declining: [String]     // Topics user stopped discussing
  },

  // ============================================
  // EMBEDDING (for similarity calculation)
  // ============================================
  embedding: {
    type: [Number],
    default: []
    // 384-dim vector from sentence-transformers
    // Used for cosine similarity drift calculation
  },

  // ============================================
  // ACTIVITY METRICS
  // ============================================
  metrics: {
    // Volume
    totalDebates: { type: Number, default: 0 },
    totalComments: { type: Number, default: 0 },
    totalPosts: { type: Number, default: 0 },
    totalSlicks: { type: Number, default: 0 },

    // Quality (from your existing systems)
    avgDebateScore: { type: Number, default: 0 },
    avgClarity: { type: Number, default: 0 },
    avgTone: { type: Number, default: 0 },
    
    // Engagement
    avgResponseTime: { type: Number, default: 0 }, // in minutes
    participationRate: { type: Number, default: 0 } // % of active days
  },

  // ============================================
  // AI-GENERATED INSIGHTS
  // ============================================
  summary: {
    type: String,
    default: ''
    // e.g., "User is becoming more analytical and less emotional in debates"
  },

  keyChanges: [{
    trait: String,
    direction: { type: String, enum: ['increasing', 'decreasing', 'stable'] },
    magnitude: Number, // 0-100
    description: String
  }],

  // ============================================
  // DRIFT ANALYSIS (compared to previous snapshot)
  // ============================================
  driftAnalysis: {
    overallDriftScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    
    previousSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PersonaSnapshot'
    },
    
    cosineSimilarity: Number, // 0-1, where 1 = identical
    
    traitChanges: [{
      trait: String,
      oldValue: Number,
      newValue: Number,
      percentChange: Number
    }],
    
    significantChanges: [{
      type: String,
      description: String,
      impact: { type: String, enum: ['low', 'medium', 'high'] }
    }]
  },

  // ============================================
  // METADATA
  // ============================================
  snapshotType: {
    type: String,
    enum: ['manual', 'automatic', 'milestone', 'scheduled'],
    default: 'automatic'
  },

  trigger: {
    type: String,
    enum: ['debate_count', 'time_interval', 'user_request', 'significant_change'],
    default: 'time_interval'
  },

  // Period this snapshot covers
  periodCovered: {
    startDate: Date,
    endDate: Date,
    durationDays: Number
  }

}, {
  timestamps: true
});

// ============================================
// INDEXES
// ============================================
personaSnapshotSchema.index({ userId: 1, timestamp: -1 });
personaSnapshotSchema.index({ userId: 1, snapshotType: 1 });
personaSnapshotSchema.index({ 'driftAnalysis.overallDriftScore': -1 });

// ============================================
// METHODS
// ============================================

// Calculate drift from previous snapshot
personaSnapshotSchema.methods.calculateDriftFrom = function(previousSnapshot) {
  if (!previousSnapshot) return 0;
  
  // Cosine similarity between embeddings
  const similarity = this.cosineSimilarity(
    this.embedding,
    previousSnapshot.embedding
  );
  
  // Convert similarity to drift (inverse)
  return Math.round((1 - similarity) * 100);
};

// Cosine similarity helper
personaSnapshotSchema.methods.cosineSimilarity = function(vecA, vecB) {
  if (!vecA?.length || !vecB?.length || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
};

// ============================================
// STATICS
// ============================================

// Get latest snapshot for user
personaSnapshotSchema.statics.getLatest = async function(userId) {
  return this.findOne({ userId }).sort({ timestamp: -1 });
};

// Get snapshot timeline
personaSnapshotSchema.statics.getTimeline = async function(userId, limit = 10) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('-embedding'); // Exclude large embedding array
};

// Get significant drift events
personaSnapshotSchema.statics.getSignificantDrifts = async function(userId, threshold = 50) {
  return this.find({
    userId,
    'driftAnalysis.overallDriftScore': { $gte: threshold }
  })
  .sort({ timestamp: -1 })
  .limit(5);
};

export default mongoose.model('PersonaSnapshot', personaSnapshotSchema);