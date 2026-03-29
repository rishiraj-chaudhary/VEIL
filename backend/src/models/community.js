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
  displayName: { type: String, required: true, trim: true, maxlength: [50, 'Display name cannot exceed 50 characters'] },
  description:  { type: String, maxlength: [500, 'Description cannot exceed 500 characters'], default: '' },
  creator:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  moderators:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  memberCount:  { type: Number, default: 0 },
  postCount:    { type: Number, default: 0 },
  rules: [{ title: String, description: String }],
  isActive: { type: Boolean, default: true },

  memoryAnalysis: {
    topicClusters:       { type: [mongoose.Schema.Types.Mixed], default: [] },
    recurringClaims:     { type: [mongoose.Schema.Types.Mixed], default: [] },
    toneProfile:         { type: mongoose.Schema.Types.Mixed,   default: null },
    polarizationScore:   { type: Number,  default: null },
    onboardingSummary:   { type: String,  default: null },
    postCountAtAnalysis: { type: Number,  default: 0 },
    analysedAt:          { type: Date,    default: null },
  },

  healthAnalysis: {
    healthScore:            { type: Number, default: null },
    riskLevel:              { type: String, default: null },
    polarizationScore:      { type: Number, default: null },
    toxicityTrend:          { type: String, default: null },
    toxicityRate:           { type: Number, default: null },
    participationImbalance: { type: Number, default: null },
    uniqueContributors:     { type: Number, default: null },
    dominantUserShare:      { type: Number, default: null },
    escalationRate:         { type: Number, default: null },
    interventionSuggestion: { type: String, default: null },
    postCountAtAnalysis:    { type: Number, default: 0 },
    analysedAt:             { type: Date,   default: null },
  },
}, { timestamps: true });

communitySchema.pre('save', function (next) {
  if (this.isNew) {
    this.moderators.push(this.creator);
    this.members.push(this.creator);
    this.memberCount = 1;
  }
  next();
});

communitySchema.index({ 'memoryAnalysis.polarizationScore': -1 });
communitySchema.index({ 'healthAnalysis.healthScore': -1 });

const Community = mongoose.models.Community || mongoose.model('Community', communitySchema);
export default Community;