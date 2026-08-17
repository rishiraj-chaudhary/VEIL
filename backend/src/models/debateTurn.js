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
    decisionTrace: mongoose.Schema.Types.Mixed,
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

/**
 * Per-side turn statistics for a debate.
 *
 * debateService.getDebateStats has always called this, but it was never defined —
 * so `GET /api/debates/:id/stats` threw "getTurnStats is not a function" on every
 * request. Aggregating in the database rather than loading every turn keeps the
 * cost flat as a debate grows.
 */
debateTurnSchema.statics.getTurnStats = async function (debateId) {
  const id = debateId instanceof mongoose.Types.ObjectId
    ? debateId
    : new mongoose.Types.ObjectId(String(debateId));

  const rows = await this.aggregate([
    { $match: { debate: id, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: '$side',
        turns:          { $sum: 1 },
        totalWords:     { $sum: '$wordCount' },
        avgWords:       { $avg: '$wordCount' },
        avgQuality:     { $avg: '$aiAnalysis.overallQuality' },
        avgTone:        { $avg: '$aiAnalysis.toneScore' },
        avgClarity:     { $avg: '$aiAnalysis.clarityScore' },
        totalClaims:    { $sum: { $size: { $ifNull: ['$aiAnalysis.claims', []] } } },
        totalFallacies: { $sum: { $size: { $ifNull: ['$aiAnalysis.fallacies', []] } } },
      },
    },
  ]);

  const round = value => (typeof value === 'number' ? Math.round(value) : null);

  const bySide = { for: null, against: null };
  for (const row of rows) {
    bySide[row._id] = {
      turns:          row.turns,
      totalWords:     row.totalWords || 0,
      avgWords:       round(row.avgWords) ?? 0,
      avgQuality:     round(row.avgQuality),
      avgTone:        round(row.avgTone),
      avgClarity:     round(row.avgClarity),
      totalClaims:    row.totalClaims || 0,
      totalFallacies: row.totalFallacies || 0,
    };
  }

  return {
    for:        bySide.for,
    against:    bySide.against,
    totalTurns: rows.reduce((sum, row) => sum + row.turns, 0),
  };
};

const DebateTurn = mongoose.models.DebateTurn || mongoose.model('DebateTurn', debateTurnSchema);

export default DebateTurn;