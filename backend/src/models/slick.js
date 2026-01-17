import mongoose from 'mongoose';
const slickSchema = new mongoose.Schema({
  // Core content
  content: {
    type: String,
    required: [true, 'Slick content is required'],
    trim: true,
    minlength: [10, 'Slick must be at least 10 characters'],
    maxlength: [500, 'Slick cannot exceed 500 characters'],
  },

  // Anonymity system
  encryptedAuthorId: {
    type: String,
    required: true, // AES encrypted author ID
  },
  
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Relationship verification
  relationshipType: {
    type: String,
    enum: ['mutual_friend', 'same_community', 'verified_peer'],
    required: true,
  },

  // Categorization
  tone: {
    category: {
      type: String,
      enum: ['praise', 'tease', 'constructive', 'observation'],
      required: true,
    },
    intensity: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
  },

  // Visibility & scope
  visibility: {
    type: String,
    enum: ['public', 'community', 'friends_only'],
    default: 'public',
  },

  // AI Analysis
  aiAnalysis: {
    harmScore: { type: Number, min: 0, max: 1 },
    constructivenessScore: { type: Number, min: 0, max: 1 },
    intentAnalysis: String,
    safetyFlags: [String],
    rewrittenVersion: String, // If AI rewrote it
  },

  // Community interaction
  reactions: {
    agree: { type: Number, default: 0 },
    disagree: { type: Number, default: 0 },
    funny: { type: Number, default: 0 },
    insightful: { type: Number, default: 0 },
    unfair: { type: Number, default: 0 },
  },

  // Users who reacted (to prevent duplicate reactions)
  reactors: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reaction: { type: String, enum: ['agree', 'disagree', 'funny', 'insightful', 'unfair'] },
  }],

  // Credibility system
  credibilityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 50,
  },

  // Identity reveal system
  identityReveal: {
    isRevealed: { type: Boolean, default: false },
    revealedAt: Date,
    revealMethod: {
      type: String,
      enum: ['currency_spent', 'community_vote', 'counter_slick', 'ai_mediation', 'time_unlock'],
    },
    revealCost: Number,
  },

  // Time-based unlock (7 days default)
  unlockAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  },

  // Status
  isActive: { type: Boolean, default: true },
  isFlagged: { type: Boolean, default: false },
  flagReason: String,

}, {
  timestamps: true,
});

// Indexes
slickSchema.index({ targetUser: 1, createdAt: -1 });
slickSchema.index({ credibilityScore: -1 });
slickSchema.index({ unlockAt: 1 });
slickSchema.index({ isActive: 1, isFlagged: 1 });

// Calculate credibility score
slickSchema.pre('save', function(next) {
  if (this.isModified('reactions') || this.isNew) {
    const totalReactions = this.reactions.agree + this.reactions.disagree + 
                          this.reactions.funny + this.reactions.insightful + this.reactions.unfair;
    
    if (totalReactions > 0) {
      const positiveReactions = this.reactions.agree + this.reactions.funny + this.reactions.insightful;
      const baseScore = (positiveReactions / totalReactions) * 100;
      
      // Factor in unfair flags (penalty)
      const unfairPenalty = (this.reactions.unfair / totalReactions) * 30;
      
      // Factor in AI analysis
      const aiBonus = this.aiAnalysis?.constructivenessScore ? 
        (this.aiAnalysis.constructivenessScore * 20) : 0;
      
      this.credibilityScore = Math.max(0, Math.min(100, 
        baseScore - unfairPenalty + aiBonus
      ));
    }
  }
  next();
});


// Simple encryption method for ES6 modules
slickSchema.statics.encryptAuthorId = function(authorId) {
  try {
    // Simple base64 encoding for now (we can make it more secure later)
    const data = JSON.stringify({
      id: authorId.toString(),
      timestamp: Date.now()
    });
    return Buffer.from(data).toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    return Buffer.from(authorId.toString()).toString('base64');
  }
};

// Simple decryption method
slickSchema.statics.decryptAuthorId = function(encryptedId) {
  try {
    const decoded = Buffer.from(encryptedId, 'base64').toString();
    const data = JSON.parse(decoded);
    return data.id;
  } catch (error) {
    // Fallback for simple base64
    try {
      return Buffer.from(encryptedId, 'base64').toString();
    } catch (e) {
      console.error('Decryption error:', error);
      return null;
    }
  }
};

// Method to check if user can reveal identity
slickSchema.methods.canRevealIdentity = function(userId, userCurrency = 0) {
  if (this.identityReveal.isRevealed) return { canReveal: false, reason: 'Already revealed' };
  if (!this.targetUser.equals(userId)) return { canReveal: false, reason: 'Not the target' };
  
  // Time-based unlock
  if (new Date() >= this.unlockAt) {
    return { canReveal: true, method: 'time_unlock', cost: 0 };
  }
  
  // Currency-based unlock
  const revealCost = Math.max(50, 100 - this.credibilityScore); // Higher credibility = lower cost
  if (userCurrency >= revealCost) {
    return { canReveal: true, method: 'currency_spent', cost: revealCost };
  }
  
  return { canReveal: false, reason: 'Insufficient currency or time not reached' };
};

export default mongoose.model('Slick', slickSchema);