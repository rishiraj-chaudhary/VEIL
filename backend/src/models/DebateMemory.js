import mongoose from 'mongoose';

const debateMemorySchema = new mongoose.Schema({
  turnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'debateTurn',
    required: true,
    unique: true,
    index: true,
  },
  debateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Debate',
    required: true,
    index: true,
  },
  text: {
    type: String,
    required: true,
  },
  embedding: {
    type: [Number],
    required: true,
  },
  metadata: {
    topic: String,
    side: {
      type: String,
      enum: ['for', 'against'],
    },
    round: Number,
    quality: Number,
  },
}, {
  timestamps: true,
});

// Indexes for efficient queries
debateMemorySchema.index({ debateId: 1, createdAt: -1 });
debateMemorySchema.index({ 'metadata.quality': -1 });

const DebateMemory = mongoose.model('DebateMemory', debateMemorySchema);
export default DebateMemory;