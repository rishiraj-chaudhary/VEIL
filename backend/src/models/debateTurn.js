import mongoose from 'mongoose';

const debateTurnSchema = new mongoose.Schema({
  // Basic Info
  debate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Debate',
    required: true,
  },
  round: {
    type: Number,
    required: true,
  },
  turnNumber: {
    type: Number,
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  side: {
    type: String,
    enum: ['for', 'against'],
    required: true,
  },

  // Content
  content: {
    type: String,
    required: [true, 'Turn content is required'],
    trim: true,
    minlength: [10, 'Content must be at least 10 characters'],
  },
  wordCount: {
    type: Number,
    required: true,
  },

  // AI Analysis (populated after submission)
  aiAnalysis: {
    claims: [String],
    rebuttals: [String],
    
    // 🔥 CRITICAL FIX: Fallacies as array of objects, not strings!
    fallacies: [{
      type: {
        type: String,
        required: true
      },
      explanation: {
        type: String,
        required: true
      },
      severity: {
        type: Number,
        required: true,
        min: 0,
        max: 10
      }
    }],
    
    toneScore: Number,
    clarityScore: Number,
    evidenceQuality: Number,
    
    evidenceAnalysis: {
      hasEvidence: Boolean,
      verified: Boolean,
      score: Number,
      indicatorCount: Number,
      sources: [String]
    },
    
    overallQuality: Number,
    decisionTrace: [String],
    retrievedSources: [String],
    
    // 🆕 PHASE 3: Fact-checking
    factCheck: {
      overallConfidence: Number,
      verified: Boolean,
      flags: [{
        claim: String,
        reason: String
      }],
      checks: [{
        claim: String,
        supported: Boolean,
        confidence: Number,
        level: String,
        reasoning: String
      }]
    }
  },

  // Metadata
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes
debateTurnSchema.index({ debate: 1, turnNumber: 1 });
debateTurnSchema.index({ author: 1, createdAt: -1 });
debateTurnSchema.index({ debate: 1, side: 1, round: 1 });

const DebateTurn = mongoose.model('DebateTurn', debateTurnSchema);

export default DebateTurn;