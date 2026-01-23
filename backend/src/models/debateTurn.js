import mongoose from 'mongoose';

const debateTurnSchema = new mongoose.Schema({
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
  turnNumber: {
    type: Number,
    required: [true, 'Turn number is required'],
    min: 1,
  },

  // Author
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author is required'],
    index: true,
  },
  side: {
    type: String,
    enum: ['for', 'against'],
    required: true,
  },

  // Content
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true,
    minlength: [10, 'Content must be at least 10 characters'],
    maxlength: [5000, 'Content cannot exceed 5000 characters'],
  },
  wordCount: {
    type: Number,
    required: true,
  },

  // AI Analysis (populated after submission)
  aiAnalysis: {
    claims: [String],
    rebuttals: [String],
    fallacies: [{
      type: String,
      explanation: String,
      severity: {
        type: Number,
        min: 1,
        max: 10,
      },
    }],
    toneScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    clarityScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    evidenceQuality: {
      type: Number,
      min: 0,
      max: 100,
    },
    overallQuality: {
      type: Number,
      min: 0,
      max: 100,
    },
  },

  // Timestamps
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  timeTaken: {
    type: Number, // in seconds
  },

  // Status
  isEdited: {
    type: Boolean,
    default: false,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Compound index for efficient queries
debateTurnSchema.index({ debate: 1, turnNumber: 1 });
debateTurnSchema.index({ debate: 1, round: 1 });
debateTurnSchema.index({ author: 1, submittedAt: -1 });

// Pre-save hook to calculate word count
debateTurnSchema.pre('save', function(next) {
  if (this.isModified('content')) {
    this.wordCount = this.content.trim().split(/\s+/).length;
  }
  next();
});

// Method to check if within word limit
debateTurnSchema.methods.isWithinLimit = async function() {
  const debate = await mongoose.model('Debate').findById(this.debate);
  if (!debate) return false;

  const roundConfig = debate.rounds.find(r => r.number === this.round);
  if (!roundConfig) return false;

  return this.wordCount <= roundConfig.wordLimit;
};

// Static method to get turn statistics
debateTurnSchema.statics.getTurnStats = async function(debateId) {
  return this.aggregate([
    { $match: { debate: mongoose.Types.ObjectId(debateId), isDeleted: false } },
    {
      $group: {
        _id: '$side',
        totalTurns: { $sum: 1 },
        avgWordCount: { $avg: '$wordCount' },
        avgToneScore: { $avg: '$aiAnalysis.toneScore' },
        avgClarityScore: { $avg: '$aiAnalysis.clarityScore' },
      }
    }
  ]);
};

const debateTurn = mongoose.model('debateTurn', debateTurnSchema);

export default debateTurn;