import mongoose from 'mongoose';

const debateSchema = new mongoose.Schema({
  // Basic Info
  topic: {
    type: String,
    required: [true, 'Debate topic is required'],
    trim: true,
    minlength: [3, 'Topic must be at least 3 characters'],
    maxlength: [300, 'Topic cannot exceed 300 characters'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
  },
  type: {
    type: String,
    enum: ['text', 'voice', 'video'],
    default: 'text',
  },
  format: {
    type: String,
    enum: ['1v1', 'team'],
    default: '1v1',
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'cancelled'],
    default: 'pending',
  },

  // Participants
  initiator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    side: {
      type: String,
      enum: ['for', 'against'],
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    isReady: {
      type: Boolean,
      default: false,
    },
  }],

  // Structure
  rounds: [{
    number: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ['opening', 'rebuttal', 'closing'],
      required: true,
    },
    wordLimit: {
      type: Number,
      required: true,
    },
    timeLimit: {
      type: Number, // in minutes
      required: true,
    },
  }],
  currentRound: {
    type: Number,
    default: 0,
  },
  currentTurn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  // Settings
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public',
  },
  allowAudience: {
    type: Boolean,
    default: true,
  },
  moderationLevel: {
    type: String,
    enum: ['light', 'strict'],
    default: 'light',
  },

  // Origin (where debate started from)
  originType: {
    type: String,
    enum: ['post', 'comment', 'slick', 'community', 'standalone'],
  },
  originId: {
    type: mongoose.Schema.Types.ObjectId,
  },

  // Timestamps
  startedAt: Date,
  completedAt: Date,

  // Results (populated after completion)
  winner: {
    type: String,
    enum: ['for', 'against', 'draw'],
  },
  finalScores: {
    for: Number,
    against: Number,
  },

  // Metadata
  totalTurns: {
    type: Number,
    default: 0,
  },
  viewCount: {
    type: Number,
    default: 0,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes for performance
debateSchema.index({ status: 1, createdAt: -1 });
debateSchema.index({ initiator: 1, createdAt: -1 });
debateSchema.index({ 'participants.user': 1 });
debateSchema.index({ originType: 1, originId: 1 });

// Virtual for participant count
debateSchema.virtual('participantCount').get(function() {
  return this.participants.length;
});

// Method to check if debate is full
debateSchema.methods.isFull = function() {
  if (this.format === '1v1') {
    return this.participants.length >= 2;
  }
  // Team debates can have more participants (future feature)
  return false;
};

// Method to get participant by side
debateSchema.methods.getParticipantBySide = function(side) {
  return this.participants.find(p => p.side === side);
};

// Method to check if user is participant
debateSchema.methods.isParticipant = function(userId) {
  return this.participants.some(p => p.user.equals(userId));
};

// Method to start debate (when both participants ready)
debateSchema.methods.startDebate = async function() {
  if (!this.isFull()) {
    throw new Error('Debate needs all participants to start');
  }
  
  const allReady = this.participants.every(p => p.isReady);
  if (!allReady) {
    throw new Error('All participants must be ready');
  }

  this.status = 'active';
  this.startedAt = new Date();
  this.currentRound = 1;
  
  // Set first turn to 'for' side
  const forParticipant = this.getParticipantBySide('for');
  this.currentTurn = forParticipant.user;
  
  await this.save();
};

// Static method to create default rounds structure
debateSchema.statics.getDefaultRounds = function() {
  return [
    { number: 1, type: 'opening', wordLimit: 200, timeLimit: 15 },
    { number: 2, type: 'rebuttal', wordLimit: 150, timeLimit: 10 },
    { number: 3, type: 'closing', wordLimit: 100, timeLimit: 10 },
  ];
};

const debate = mongoose.model('debate', debateSchema);

export default debate;