import mongoose from 'mongoose';

const debateReactionSchema = new mongoose.Schema({
  debate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Debate',
    required: [true, 'Debate reference is required'],
    index: true,
  },
  turn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DebateTurn',
    required: [true, 'Turn reference is required'],
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true,
  },

  reactionType: {
    type: String,
    enum: ['agree', 'disagree', 'strong_point', 'fallacy'],
    required: [true, 'Reaction type is required'],
  },
  comment: {
    type: String,
    trim: true,
    maxlength: [200, 'Comment cannot exceed 200 characters'],
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: false, // Using custom createdAt
});

// Compound unique index - one reaction per user per turn
debateReactionSchema.index(
  { debate: 1, turn: 1, user: 1 },
  { unique: true }
);

// Index for efficient aggregation
debateReactionSchema.index({ turn: 1, reactionType: 1 });

// Static method to get reaction counts for a turn
debateReactionSchema.statics.getReactionCounts = async function(turnId) {
  return this.aggregate([
    { $match: { turn: mongoose.Types.ObjectId(turnId) } },
    {
      $group: {
        _id: '$reactionType',
        count: { $sum: 1 }
      }
    }
  ]);
};

// Static method to get reactions summary for debate
debateReactionSchema.statics.getDebateSummary = async function(debateId) {
  return this.aggregate([
    { $match: { debate: mongoose.Types.ObjectId(debateId) } },
    {
      $group: {
        _id: {
          turn: '$turn',
          reactionType: '$reactionType'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.turn',
        reactions: {
          $push: {
            type: '$_id.reactionType',
            count: '$count'
          }
        },
        totalReactions: { $sum: '$count' }
      }
    }
  ]);
};

// Method to check if user has already reacted to this turn
debateReactionSchema.statics.hasUserReacted = async function(turnId, userId) {
  const reaction = await this.findOne({ turn: turnId, user: userId });
  return !!reaction;
};

const debateReaction = mongoose.model('debateReaction', debateReactionSchema);

export default debateReaction;