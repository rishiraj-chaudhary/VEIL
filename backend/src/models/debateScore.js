import mongoose from 'mongoose';

const debateScoreSchema = new mongoose.Schema({
  debate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Debate',
    required: true,
    unique: true,
    index: true,
  },

  // Per-side scores
  scores: {
    for: {
      argumentQuality: {
        type: Number,
        min: 0,
        max: 100,
        required: true,
      },
      rebuttalEffectiveness: {
        type: Number,
        min: 0,
        max: 100,
        required: true,
      },
      conductClarity: {
        type: Number,
        min: 0,
        max: 100,
        required: true,
      },
      audienceSupport: {
        type: Number,
        min: 0,
        max: 100,
        required: true,
      },
      total: {
        type: Number,
        min: 0,
        max: 100,
      },
    },
    against: {
      argumentQuality: {
        type: Number,
        min: 0,
        max: 100,
        required: true,
      },
      rebuttalEffectiveness: {
        type: Number,
        min: 0,
        max: 100,
        required: true,
      },
      conductClarity: {
        type: Number,
        min: 0,
        max: 100,
        required: true,
      },
      audienceSupport: {
        type: Number,
        min: 0,
        max: 100,
        required: true,
      },
      total: {
        type: Number,
        min: 0,
        max: 100,
      },
    },
  },

  // Breakdown by round
  roundScores: [{
    round: {
      type: Number,
      required: true,
    },
    for: {
      type: Number,
      min: 0,
      max: 100,
    },
    against: {
      type: Number,
      min: 0,
      max: 100,
    },
  }],

  // AI Insights
  insights: {
    strongestArgumentFor: String,
    strongestArgumentAgainst: String,
    missedRebuttals: [String],
    keyMoments: [{
      turn: Number,
      description: String,
      impact: {
        type: String,
        enum: ['high', 'medium', 'low'],
      },
    }],
    overallAnalysis: String,
  },

  // Winner determination
  winner: {
    type: String,
    enum: ['for', 'against', 'draw'],
    required: true,
  },
  confidence: {
    type: Number,
    min: 0,
    max: 100,
  },
  reasoning: String,

  // Weights used for calculation
  weights: {
    argumentQuality: {
      type: Number,
      default: 40,
    },
    rebuttalEffectiveness: {
      type: Number,
      default: 25,
    },
    conductClarity: {
      type: Number,
      default: 15,
    },
    audienceSupport: {
      type: Number,
      default: 20,
    },
  },

  // Timestamp
  calculatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Calculate total scores before saving
debateScoreSchema.pre('save', function(next) {
  const weights = this.weights;
  
  // Calculate total for 'for' side
  this.scores.for.total = (
    (this.scores.for.argumentQuality * weights.argumentQuality / 100) +
    (this.scores.for.rebuttalEffectiveness * weights.rebuttalEffectiveness / 100) +
    (this.scores.for.conductClarity * weights.conductClarity / 100) +
    (this.scores.for.audienceSupport * weights.audienceSupport / 100)
  );

  // Calculate total for 'against' side
  this.scores.against.total = (
    (this.scores.against.argumentQuality * weights.argumentQuality / 100) +
    (this.scores.against.rebuttalEffectiveness * weights.rebuttalEffectiveness / 100) +
    (this.scores.against.conductClarity * weights.conductClarity / 100) +
    (this.scores.against.audienceSupport * weights.audienceSupport / 100)
  );

  // Determine winner based on total scores
  const diff = Math.abs(this.scores.for.total - this.scores.against.total);
  
  if (diff < 5) { // If within 5 points, it's a draw
    this.winner = 'draw';
    this.confidence = 50;
  } else if (this.scores.for.total > this.scores.against.total) {
    this.winner = 'for';
    this.confidence = Math.min(50 + diff, 100);
  } else {
    this.winner = 'against';
    this.confidence = Math.min(50 + diff, 100);
  }

  next();
});

// Method to get score difference
debateScoreSchema.methods.getScoreDifference = function() {
  return Math.abs(this.scores.for.total - this.scores.against.total);
};

// Method to get winning margin
debateScoreSchema.methods.getWinningMargin = function() {
  if (this.winner === 'draw') return 0;
  return this.getScoreDifference();
};

const debateScore = mongoose.model('debateScore', debateScoreSchema);

export default debateScore;