import mongoose from 'mongoose';

const slickSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Slick content is required'],
    trim: true,
    minlength: [10, 'Slick must be at least 10 characters'],
    maxlength: [500, 'Slick cannot exceed 500 characters'],
  },

  encryptedAuthorId: { type: String, required: true },

  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  relationshipType: {
    type: String,
    // ── added platform_member ─────────────────────────────────────────────────
    enum: ['mutual_friend', 'same_community', 'verified_peer', 'platform_member'],
    required: true,
  },

  tone: {
    category: {
      type: String,
      enum: ['praise', 'tease', 'constructive', 'observation'],
      required: true,
    },
    intensity: { type: Number, min: 1, max: 10, required: true },
  },

  visibility: {
    type: String,
    enum: ['public', 'community', 'friends_only'],
    default: 'public',
  },

  aiAnalysis: {
    harmScore:             { type: Number, min: 0, max: 1 },
    constructivenessScore: { type: Number, min: 0, max: 1 },
    intentAnalysis:        String,
    safetyFlags:           [String],
    rewrittenVersion:      String,
  },

  reactions: {
    agree:     { type: Number, default: 0 },
    disagree:  { type: Number, default: 0 },
    funny:     { type: Number, default: 0 },
    insightful:{ type: Number, default: 0 },
    unfair:    { type: Number, default: 0 },
  },

  reactors: [{
    user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reaction: { type: String, enum: ['agree', 'disagree', 'funny', 'insightful', 'unfair'] },
  }],

  credibilityScore: { type: Number, min: 0, max: 100, default: 50 },

  identityReveal: {
    isRevealed:   { type: Boolean, default: false },
    revealedAt:   Date,
    revealMethod: {
      type: String,
      enum: ['currency_spent', 'community_vote', 'counter_slick', 'ai_mediation', 'time_unlock'],
    },
    revealCost: Number,
  },

  unlockAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },

  isActive:   { type: Boolean, default: true },
  isFlagged:  { type: Boolean, default: false },
  flagReason: String,

}, { timestamps: true });

slickSchema.index({ targetUser: 1, createdAt: -1 });
slickSchema.index({ credibilityScore: -1 });
slickSchema.index({ unlockAt: 1 });
slickSchema.index({ isActive: 1, isFlagged: 1 });

slickSchema.pre('save', function (next) {
  if (this.isModified('reactions') || this.isNew) {
    const total = this.reactions.agree + this.reactions.disagree +
                  this.reactions.funny + this.reactions.insightful + this.reactions.unfair;

    if (total > 0) {
      const positive      = this.reactions.agree + this.reactions.funny + this.reactions.insightful;
      const baseScore     = (positive / total) * 100;
      const unfairPenalty = (this.reactions.unfair / total) * 30;
      const aiBonus       = this.aiAnalysis?.constructivenessScore
        ? this.aiAnalysis.constructivenessScore * 20 : 0;

      this.credibilityScore = Math.max(0, Math.min(100, baseScore - unfairPenalty + aiBonus));
    }
  }
  next();
});

slickSchema.statics.encryptAuthorId = function (authorId) {
  try {
    const data = JSON.stringify({ id: authorId.toString(), timestamp: Date.now() });
    return Buffer.from(data).toString('base64');
  } catch {
    return Buffer.from(authorId.toString()).toString('base64');
  }
};

slickSchema.statics.decryptAuthorId = function (encryptedId) {
  try {
    const decoded = Buffer.from(encryptedId, 'base64').toString();
    return JSON.parse(decoded).id;
  } catch {
    try { return Buffer.from(encryptedId, 'base64').toString(); }
    catch { return null; }
  }
};

slickSchema.methods.canRevealIdentity = function (userId, userCurrency = 0) {
  if (this.identityReveal.isRevealed)       return { canReveal: false, reason: 'Already revealed' };
  if (!this.targetUser.equals(userId))       return { canReveal: false, reason: 'Not the target' };
  if (new Date() >= this.unlockAt)           return { canReveal: true,  method: 'time_unlock',    cost: 0 };

  const revealCost = Math.max(50, 100 - this.credibilityScore);
  if (userCurrency >= revealCost)            return { canReveal: true,  method: 'currency_spent', cost: revealCost };

  return { canReveal: false, reason: 'Insufficient currency or time not reached' };
};

const Slick = mongoose.models.Slick || mongoose.model('Slick', slickSchema);
export default Slick;