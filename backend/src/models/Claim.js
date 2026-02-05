import mongoose from 'mongoose';

/**
 * ARGUMENT KNOWLEDGE GRAPH - CLAIM MODEL
 * 
 * Tracks individual claims across all debates
 * Links related claims and tracks usage patterns
 */

const claimSchema = new mongoose.Schema({
  // Original claim text
  originalText: {
    type: String,
    required: true,
    index: true
  },

  // Normalized version for matching
  normalizedText: {
    type: String,
    required: true,
    index: true
  },

  // Topic/category (detected automatically)
  topic: {
    type: String,
    index: true
  },

  // First debate this claim appeared in
  firstDebate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Debate',
    required: true
  },

  // First turn this claim appeared in
  firstTurn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DebateTurn',
    required: true
  },

  // All debates where this claim was used
  debates: [{
    debate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Debate'
    },
    turn: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DebateTurn'
    },
    side: {
      type: String,
      enum: ['for', 'against']
    },
    usedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Usage statistics
  stats: {
    totalUses: {
      type: Number,
      default: 1
    },
    
    // How many times it was directly refuted
    timesRefuted: {
      type: Number,
      default: 0
    },

    // How many times it appeared in winning arguments
    winsWithClaim: {
      type: Number,
      default: 0
    },

    // How many times it appeared in losing arguments
    lossesWithClaim: {
      type: Number,
      default: 0
    },

    // Average AI quality score when this claim is used
    avgQualityScore: {
      type: Number,
      default: 0
    },

    // Success rate (wins / total uses)
    successRate: {
      type: Number,
      default: 0
    }
  },

  // Related claims (similar arguments)
  relatedClaims: [{
    claim: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Claim'
    },
    relationship: {
      type: String,
      enum: ['similar', 'refutes', 'supports', 'extends'],
      default: 'similar'
    },
    similarity: {
      type: Number,
      min: 0,
      max: 1
    }
  }],

  // Counter-claims (arguments that refute this)
  counterClaims: [{
    claim: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Claim'
    },
    effectiveness: {
      type: Number,
      min: 0,
      max: 10,
      default: 5
    }
  }],

  // Embedding for similarity search (optional, for advanced matching)
  embedding: [Number],

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient queries
claimSchema.index({ normalizedText: 'text' });
claimSchema.index({ 'stats.totalUses': -1 });
claimSchema.index({ 'stats.successRate': -1 });
claimSchema.index({ topic: 1, 'stats.totalUses': -1 });

// Update timestamp on save
claimSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for success rate percentage
claimSchema.virtual('successRatePercent').get(function() {
  return Math.round(this.stats.successRate * 100);
});

// Method to add usage
claimSchema.methods.addUsage = async function(debate, turn, side, qualityScore) {
  this.debates.push({
    debate,
    turn,
    side,
    usedAt: new Date()
  });

  this.stats.totalUses += 1;

  // Update average quality score
  const currentAvg = this.stats.avgQualityScore;
  const currentTotal = this.stats.totalUses - 1;
  this.stats.avgQualityScore = ((currentAvg * currentTotal) + qualityScore) / this.stats.totalUses;

  await this.save();
};

// Method to mark as refuted
claimSchema.methods.markRefuted = async function() {
  this.stats.timesRefuted += 1;
  await this.save();
};

// Method to update win/loss
claimSchema.methods.updateOutcome = async function(won) {
  if (won) {
    this.stats.winsWithClaim += 1;
  } else {
    this.stats.lossesWithClaim += 1;
  }

  // Recalculate success rate
  const totalOutcomes = this.stats.winsWithClaim + this.stats.lossesWithClaim;
  if (totalOutcomes > 0) {
    this.stats.successRate = this.stats.winsWithClaim / totalOutcomes;
  }

  await this.save();
};

// Static method to find similar claims
claimSchema.statics.findSimilar = async function(normalizedText, limit = 5) {
  return this.find({
    $text: { $search: normalizedText }
  })
  .limit(limit)
  .sort({ score: { $meta: 'textScore' } });
};

// Static method to get popular claims
claimSchema.statics.getPopularClaims = async function(topic = null, limit = 10) {
  const query = topic ? { topic } : {};
  
  return this.find(query)
    .sort({ 'stats.totalUses': -1 })
    .limit(limit)
    .populate('firstDebate', 'topic')
    .populate('firstTurn', 'author');
};

// Static method to get most successful claims
claimSchema.statics.getMostSuccessful = async function(topic = null, limit = 10) {
  const query = topic ? { topic } : {};
  
  return this.find(query)
    .sort({ 'stats.successRate': -1, 'stats.totalUses': -1 })
    .limit(limit)
    .populate('firstDebate', 'topic');
};

const Claim = mongoose.model('Claim', claimSchema);

export default Claim;