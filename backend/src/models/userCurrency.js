import mongoose from 'mongoose';

const userCurrencySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  
  // Virtual currency for platform interactions
  veilCoins: {
    type: Number,
    default: 100, // Starting amount
    min: 0,
  },

  // Transaction history
  transactions: [{
    type: {
      type: String,
      enum: ['earned', 'spent', 'gifted', 'penalty'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    relatedId: mongoose.Schema.Types.ObjectId, // Related slick, post, etc.
    timestamp: {
      type: Date,
      default: Date.now,
    },
  }],

  // Earning stats
  earnings: {
    totalEarned: { type: Number, default: 0 },
    fromSlicks: { type: Number, default: 0 },
    fromPosts: { type: Number, default: 0 },
    fromComments: { type: Number, default: 0 },
    dailyStreak: { type: Number, default: 0 },
    lastEarningDate: Date,
  },

}, {
  timestamps: true,
});

// Method to add transaction
userCurrencySchema.methods.addTransaction = function(type, amount, reason, relatedId = null) {
  this.transactions.push({
    type,
    amount,
    reason,
    relatedId,
  });

  if (type === 'earned' || type === 'gifted') {
    this.veilCoins += amount;
    this.earnings.totalEarned += amount;
  } else if (type === 'spent' || type === 'penalty') {
    this.veilCoins = Math.max(0, this.veilCoins - amount);
  }

  return this.save();
};

// Method to check if user can afford something
userCurrencySchema.methods.canAfford = function(amount) {
  return this.veilCoins >= amount;
};

// Daily earning bonus
userCurrencySchema.methods.claimDailyBonus = function() {
  const today = new Date().toDateString();
  const lastEarning = this.earnings.lastEarningDate?.toDateString();

  if (lastEarning !== today) {
    let bonus = 10; // Base daily bonus
    
    // Streak bonus
    if (lastEarning === new Date(Date.now() - 86400000).toDateString()) {
      this.earnings.dailyStreak += 1;
      bonus += Math.min(this.earnings.dailyStreak * 2, 50); // Max 50 bonus
    } else {
      this.earnings.dailyStreak = 1;
    }

    this.addTransaction('earned', bonus, 'Daily login bonus');
    this.earnings.lastEarningDate = new Date();
    
    return { earned: bonus, streak: this.earnings.dailyStreak };
  }

  return null; // Already claimed today
};

export default mongoose.model('UserCurrency', userCurrencySchema);