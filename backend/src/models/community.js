import mongoose from 'mongoose';

const communitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Community name is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Community name must be at least 3 characters'],
    maxlength: [21, 'Community name cannot exceed 21 characters'],
    match: [/^[a-z0-9_]+$/, 'Community name can only contain lowercase letters, numbers, and underscores'],
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: [50, 'Display name cannot exceed 50 characters'],
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: '',
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  moderators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  memberCount: {
    type: Number,
    default: 0,
  },
  postCount: {
    type: Number,
    default: 0,
  },
  rules: [{
    title: String,
    description: String,
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Add creator as first moderator and member
communitySchema.pre('save', function(next) {
  if (this.isNew) {
    this.moderators.push(this.creator);
    this.members.push(this.creator);
    this.memberCount = 1;
  }
  next();
});

const Community = mongoose.model('Community', communitySchema);

export default Community;