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
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  persona: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Persona',
  },
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true,
  },
  upvotes: {
    type: Number,
    default: 0,
  },
  downvotes: {
    type: Number,
    default: 0,
  },
  karma: {
    type: Number,
    default: 0,
  },
  voters: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    vote: {
      type: Number, // 1 for upvote, -1 for downvote
      enum: [1, -1],
    },
  }],
  commentCount: {
    type: Number,
    default: 0,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Calculate karma (upvotes - downvotes)
postSchema.pre('save', function(next) {
  this.karma = this.upvotes - this.downvotes;
  next();
});

// Index for better query performance
postSchema.index({ community: 1, createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ karma: -1 });

const Post = mongoose.model('Post', postSchema);

export default Post;