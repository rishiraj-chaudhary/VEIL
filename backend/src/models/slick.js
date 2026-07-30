import mongoose from 'mongoose';
import {
  authorTag as computeAuthorTag,
  decryptAuthorId as decryptId,
  encryptAuthorId as encryptId,
  isLegacyEncoding,
} from '../utils/anonymity.js';

const slickSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Slick content is required'],
    trim: true,
    minlength: [10, 'Slick must be at least 10 characters'],
    maxlength: [500, 'Slick cannot exceed 500 characters'],
  },

  // AES-256-GCM ciphertext of the author id. `select: false` because this must
  // never reach a client: the whole feature is anonymity, and the identity
  // reveal behind it is a paid action. Reads that genuinely need it opt in with
  // .select('+encryptedAuthorId').
  encryptedAuthorId: { type: String, required: true, select: false },

  // Deterministic HMAC of the author id, so "slicks I sent" is an indexed
  // lookup instead of loading every slick and decoding each one. One-way, but
  // still hidden: it is stable per author, so a recipient holding two tags
  // could tell two anonymous notes came from the same person.
  authorTag: { type: String, required: true, index: true, select: false },

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

  // Server-side only: this exists to stop a user reacting twice, and nothing in
  // the frontend reads it. It was being returned to clients, which exposed who
  // reacted to anonymous feedback about someone — and if the author reacted to
  // their own slick, put their id in the payload alongside it.
  //
  // The displayed counts live in `reactions`, which stays public.
  reactors: {
    type: [{
      user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reaction: { type: String, enum: ['agree', 'disagree', 'funny', 'insightful', 'unfair'] },
    }],
    select: false,
    default: [],
  },

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

// These delegate to utils/anonymity.js. The previous implementations were
// base64 encode/decode under encryption names, with a fallback that also just
// encoded — so there was no configuration in which authorship was protected.
slickSchema.statics.encryptAuthorId = function (authorId) {
  return encryptId(authorId);
};

slickSchema.statics.decryptAuthorId = function (encryptedId) {
  return decryptId(encryptedId);
};

/** Deterministic tag for querying an author's own slicks. */
slickSchema.statics.authorTag = function (authorId) {
  return computeAuthorTag(authorId);
};

/** True for rows still written in the old reversible encoding. */
slickSchema.statics.isLegacyAuthor = function (encryptedId) {
  return isLegacyEncoding(encryptedId);
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