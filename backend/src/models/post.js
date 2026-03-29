import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Post title is required'],
    trim: true,
    minlength: [3, 'Title must be at least 3 characters'],
    maxlength: [300, 'Title cannot exceed 300 characters'],
  },
  content: {
    type: String,
    maxlength: [40000, 'Content cannot exceed 40000 characters'],
  },
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  persona:   { type: mongoose.Schema.Types.ObjectId, ref: 'Persona' },
  community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
  upvotes:   { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  karma:     { type: Number, default: 0 },
  voters: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    vote: { type: Number, enum: [1, -1] },
  }],
  commentCount: { type: Number, default: 0 },
  isDeleted:    { type: Boolean, default: false },
  deletedAt:    { type: Date },

  // ── Step 12: AI Feed Intelligence ────────────────────────────────────────
  intentType: {
    type: String,
    enum: ['argument','question','discussion','evidence','opinion','humor','news','rant','call_to_action','unknown'],
    default: 'unknown',
  },
  intentConfidence:   { type: Number, default: 0, min: 0, max: 1 },
  intentEmbedding:    { type: [Number], default: [], select: false },
  intentClassifiedAt: { type: Date, default: null },

  // ── Step 13: Thread Evolution ─────────────────────────────────────────────
  threadAnalysis: {
    healthScore:            { type: Number, default: null },
    healthLabel:            { type: String, default: null },
    scoreBreakdown:         { type: mongoose.Schema.Types.Mixed, default: null },
    sentimentArc:           { type: mongoose.Schema.Types.Mixed, default: null },
    topicDrift:             { type: mongoose.Schema.Types.Mixed, default: null },
    turningPoints:          { type: [mongoose.Schema.Types.Mixed], default: [] },
    dominantVoices:         { type: [mongoose.Schema.Types.Mixed], default: [] },
    commentCountAtAnalysis: { type: Number, default: 0 },
    analysedAt:             { type: Date, default: null },
  },
}, { timestamps: true });

postSchema.pre('save', function (next) {
  this.karma = this.upvotes - this.downvotes;
  next();
});

postSchema.index({ community: 1, createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ karma: -1 });
postSchema.index({ intentType: 1 });
postSchema.index({ 'threadAnalysis.healthScore': -1 });

const Post = mongoose.models.Post || mongoose.model('Post', postSchema);
export default Post;