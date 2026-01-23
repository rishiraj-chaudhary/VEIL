import mongoose from 'mongoose';

const debateVoteSchema = new mongoose.Schema({
  debate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Debate',
    required: [true, 'Debate reference is required'],
    index: true,
  },
  round: {
    type: Number,
    required: [true, 'Round number is required'],
    min: 1,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true,
  },

  vote: {
    type: String,
    enum: ['for', 'against'],
    required: [true, 'Vote is required'],
  },
  confidence: {
    type: Number,
    min: 1,
    max: 5,
    default: 3,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: false, // Using custom createdAt
});

// Compound unique index - one vote per user per round per debate
debateVoteSchema.index(
  { debate: 1, round: 1, user: 1 },
  { unique: true }
);

// Index for efficient vote counting
debateVoteSchema.index({ debate: 1, round: 1, vote: 1 });

// Static method to get vote counts for a round
debateVoteSchema.statics.getRoundVotes = async function(debateId, round) {
  return this.aggregate([
    {
      $match: {
        debate: mongoose.Types.ObjectId(debateId),
        round: round
      }
    },
    {
      $group: {
        _id: '$vote',
        count: { $sum: 1 },
        avgConfidence: { $avg: '$confidence' }
      }
    }
  ]);
};

// Static method to get all votes for a debate
debateVoteSchema.statics.getDebateVotes = async function(debateId) {
  return this.aggregate([
    { $match: { debate: mongoose.Types.ObjectId(debateId) } },
    {
      $group: {
        _id: {
          round: '$round',
          vote: '$vote'
        },
        count: { $sum: 1 },
        avgConfidence: { $avg: '$confidence' }
      }
    },
    {
      $group: {
        _id: '$_id.round',
        votes: {
          $push: {
            side: '$_id.vote',
            count: '$count',
            avgConfidence: '$avgConfidence'
          }
        },
        totalVotes: { $sum: '$count' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

// Static method to calculate audience support score (0-100)
debateVoteSchema.statics.getAudienceSupport = async function(debateId) {
  const allVotes = await this.find({ debate: debateId });
  
  if (allVotes.length === 0) {
    return { for: 50, against: 50 }; // Neutral if no votes
  }

  let forScore = 0;
  let againstScore = 0;

  allVotes.forEach(vote => {
    const weight = vote.confidence / 5; // Normalize confidence to 0-1
    if (vote.vote === 'for') {
      forScore += weight;
    } else {
      againstScore += weight;
    }
  });

  const total = forScore + againstScore;
  
  return {
    for: Math.round((forScore / total) * 100),
    against: Math.round((againstScore / total) * 100)
  };
};

// Method to check if user has voted in this round
debateVoteSchema.statics.hasUserVoted = async function(debateId, round, userId) {
  const vote = await this.findOne({
    debate: debateId,
    round: round,
    user: userId
  });
  return !!vote;
};

const debateVote = mongoose.model('debateVote', debateVoteSchema);

export default debateVote;