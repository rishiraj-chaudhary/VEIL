import mongoose from 'mongoose';

const personaSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: [true, 'Persona name is required'],
    trim: true,
    minlength: [3, 'Persona name must be at least 3 characters'],
    maxlength: [50, 'Persona name cannot exceed 50 characters'],
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: '',
  },
  reputation: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  // Stats for behavioral analysis (we'll use these later)
  stats: {
    totalPosts: { type: Number, default: 0 },
    totalComments: { type: Number, default: 0 },
    avgSentiment: { type: Number, default: 0 },
    topicsEngaged: [{ type: String }],
  },
}, {
  timestamps: true,
});

// Ensure user can't create duplicate persona names
personaSchema.index({ user: 1, name: 1 }, { unique: true });

// Limit user to 5 personas
personaSchema.pre('save', async function(next) {
  if (this.isNew) {
    const personaCount = await mongoose.model('Persona').countDocuments({ 
      user: this.user 
    });
    
    if (personaCount >= 5) {
      throw new Error('Maximum 5 personas allowed per user');
    }
  }
  next();
});

const Persona = mongoose.model('Persona', personaSchema);

export default Persona;