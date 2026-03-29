/**
 * HUDDLE MODEL — Phase 11
 * Place at: backend/src/models/Huddle.js
 */

import mongoose from 'mongoose';

const huddleSchema = new mongoose.Schema({
  // Who created it
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Who joined
  guest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  // Status lifecycle
  status: {
    type: String,
    enum: ['waiting', 'active', 'ended', 'cancelled'],
    default: 'waiting',
  },

  // Optional context — huddle started from a post or debate
  contextType: {
    type: String,
    enum: ['post', 'debate', 'standalone'],
    default: 'standalone',
  },
  contextId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },

  // Timing
  startedAt:  { type: Date, default: null },
  endedAt:    { type: Date, default: null },
  duration:   { type: Number, default: 0 }, // seconds

  // Transcript (collected from speech-to-text chunks)
  transcript: [{
    speaker:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username:  String,
    text:      String,
    timestamp: { type: Date, default: Date.now },
  }],

  // AI post-huddle analysis
  aiSummary: {
    summary:       { type: String, default: null },
    claims:        { type: [mongoose.Schema.Types.Mixed], default: [] },
    keyMoments:    { type: [String], default: [] },
    generatedPost: {
      title:   { type: String, default: null },
      content: { type: String, default: null },
    },
    analysedAt: { type: Date, default: null },
  },

  // Post created from this huddle
  createdPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    default: null,
  },

  // Join code for sharing
  joinCode: {
    type: String,
    unique: true,
    sparse: true,
  },
}, {
  timestamps: true,
});

huddleSchema.index({ host: 1, status: 1 });
huddleSchema.index({ joinCode: 1 });
huddleSchema.index({ createdAt: -1 });

const Huddle = mongoose.models.Huddle || mongoose.model('Huddle', huddleSchema);
export default Huddle;