import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false,
  },
  karma: {
    type: Number,  
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },

  // ✅ Subscription field for AI cost governance
  subscription: {
    tier: {
      type: String,
      enum: ['free', 'pro', 'team', 'enterprise'],
      default: 'free',
    },
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired'],
      default: 'active',
    },
  },

  // ✅ Role field (for admin access to platform stats)
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },

  // ── Perception fields (Step 10 — PerceptionGraph) ─────────────
  // How OTHER users perceive this user, built from received Slicks.
  // Compared against PersonaSnapshot.traits to compute the self-gap.

  perceptionTraits: {
    tone: { type: String },
    vocabularyComplexity: { type: Number },
    aggressiveness: { type: Number },
    empathy: { type: Number },
    formality: { type: Number },
    humor: { type: Number },
    argumentativeStyle: { type: String },
  },

  perceptionEmbedding: [{ type: Number }],

  perceptionTrend: {
    type: String,
    enum: ['improving', 'stable', 'declining', 'shifting'],
    default: 'stable',
  },

  perceptionSummary: {
    type: String,
    default: '',
  },

  perceptionUpdatedAt: {
    type: Date,
  },

}, {
  timestamps: true,
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    karma: this.karma,
    createdAt: this.createdAt,
  };
};

// ✅ FIX: Prevent model overwrite error
const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;