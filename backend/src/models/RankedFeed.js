import mongoose from 'mongoose';

/**
 * A user's precomputed feed ranking.
 *
 * Only post ids and their scores are stored, never post bodies: vote counts and
 * comment counts change constantly, so posts are hydrated fresh on read. That
 * keeps this document small and prevents it from serving stale content.
 */
const rankedFeedSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },

  entries: [{
    post:   { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    score:  { type: Number, default: 0 },
    why:    { type: String, default: '' },
    scores: { type: mongoose.Schema.Types.Mixed, default: null },
  }],

  generatedAt: { type: Date, default: Date.now },

  // Set while a recompute is in flight so concurrent requests don't all trigger
  // their own run of the ranking graph for the same user.
  computingSince: { type: Date, default: null },

  lastError: { type: String, default: null },
}, { timestamps: true });

rankedFeedSchema.index({ generatedAt: 1 });

const RankedFeed = mongoose.models.RankedFeed || mongoose.model('RankedFeed', rankedFeedSchema);

export default RankedFeed;
