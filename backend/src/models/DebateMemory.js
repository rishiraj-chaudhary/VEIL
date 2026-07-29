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
  // Written by vectorStoreService.addToMemory through LangChain, which spreads a
  // Document's metadata across the root of the record. Nesting the fields under a
  // `metadata` key in the Document is what reproduces this shape, and the same
  // paths are declared as Atlas filter fields so retrieval can pre-filter on them.
  metadata: {
    topic: String,
    side: {
      type: String,
      enum: ['for', 'against'],
    },
    round: Number,
    quality: Number,
    // Was written at the root by the old flat shape, so it landed outside this
    // object and read back undefined on every record.
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
}, {
  timestamps: true,
});

// Indexes for efficient queries
debateMemorySchema.index({ debateId: 1, createdAt: -1 });
debateMemorySchema.index({ 'metadata.quality': -1 });

const DebateMemory = mongoose.model('DebateMemory', debateMemorySchema);
export default DebateMemory;