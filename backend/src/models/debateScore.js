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
  //
  // This block previously declared `strongestArgumentFor`, `missedRebuttals` and
  // `overallAnalysis`, none of which the scoring service writes — it produces
  // `strongestArguments`, `missedOpportunities`, `keyMoments` and `summary`.
  // Under strict mode every one of those keys was silently discarded on write,
  // so the LLM call that generates the debate summary was paid for on every
  // completed debate and its output never stored. The shape now matches the
  // producer.
  insights: {
    strongestArguments: {
      for: {
        content: String,
        quality: Number,
        round:   Number,
      },
      against: {
        content: String,
        quality: Number,
        round:   Number,
      },
    },
    missedOpportunities: [{
      side:        { type: String, enum: ['for', 'against'] },
      missedClaim: String,
      round:       Number,
    }],
    keyMoments: [{
      round:       Number,
      side:        { type: String, enum: ['for', 'against'] },
      type:        { type: String, enum: ['strong_response', 'weak_response'] },
      description: String,
    }],
    summary: String,
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

  // Weights used for calculation.
  //
  // These must match debateScoringService.weightedTotal, which is what actually
  // computes the stored totals. They previously read 40/25/15/20 while the
  // service used 40/30/15/15, so the record of "how this was scored" contradicted
  // the score sitting next to it.
  weights: {
    argumentQuality: {
      type: Number,
      default: 40,
    },
    rebuttalEffectiveness: {
      type: Number,
      default: 30,
    },
    conductClarity: {
      type: Number,
      default: 15,
    },
    audienceSupport: {
      type: Number,
      default: 15,
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

/**
 * Confidence is derived here; totals and winner are not.
 *
 * This hook used to recompute both totals from its own weight set and then
 * overwrite `winner` with its own draw rule. That is a second, disagreeing
 * implementation of the verdict: the service weights reasoning at 40/30/15/15
 * and declares any margin a win, while this declared a draw under five points
 * using 40/25/15/20. It only ever stayed invisible because the service writes
 * through `findOneAndUpdate`, which does not run document middleware — so the
 * two would have diverged the moment anyone called `.save()`.
 *
 * The service owns the verdict. This fills in the margin-derived confidence,
 * which nothing else computes.
 */
debateScoreSchema.pre('save', function(next) {
  const diff = Math.abs((this.scores?.for?.total ?? 0) - (this.scores?.against?.total ?? 0));
  this.confidence = this.winner === 'draw' ? 50 : Math.min(50 + diff, 100);
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

const debateScore = mongoose.models.debateScore || mongoose.model('debateScore', debateScoreSchema);

export default debateScore;