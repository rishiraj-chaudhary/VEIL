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

/**
 * Applies a transaction to the in-memory document without persisting.
 *
 * Separated from the save so a caller can apply several related changes and
 * write them once — `claimDailyBonus` in particular has to record the claim date
 * in the same write as the credit, or the bonus can be claimed repeatedly.
 */
userCurrencySchema.methods.applyTransaction = function(type, amount, reason, relatedId = null) {
  this.transactions.push({
    type,
    amount,
    reason,
    relatedId,
  });

  // The history is the audit trail, not a growth surface — an account that has
  // been active for years should not carry an unbounded array in every read.
  if (this.transactions.length > 200) {
    this.transactions = this.transactions.slice(-200);
  }

  if (type === 'earned' || type === 'gifted') {
    this.veilCoins += amount;
    this.earnings.totalEarned += amount;
  } else if (type === 'spent' || type === 'penalty') {
    this.veilCoins = Math.max(0, this.veilCoins - amount);
  }

  return this;
};

// Method to add transaction
userCurrencySchema.methods.addTransaction = function(type, amount, reason, relatedId = null) {
  this.applyTransaction(type, amount, reason, relatedId);
  return this.save();
};

// Method to check if user can afford something
userCurrencySchema.methods.canAfford = function(amount) {
  return this.veilCoins >= amount;
};

/**
 * Daily earning bonus.
 *
 * Async and single-write by necessity. The previous version credited the coins
 * through `addTransaction` — which begins a save immediately — and only then set
 * `lastEarningDate`, on a document Mongoose had already serialised. The claim
 * date therefore never persisted, and since the guard below reads exactly that
 * field, the bonus could be claimed again on the very next request: an unbounded
 * currency mint. The credit and the date now land in one save.
 */
userCurrencySchema.methods.claimDailyBonus = async function() {
  const today = new Date().toDateString();
  const lastEarning = this.earnings.lastEarningDate?.toDateString();

  if (lastEarning === today) return null; // Already claimed today

  let bonus = 10; // Base daily bonus

  // Streak bonus
  if (lastEarning === new Date(Date.now() - 86400000).toDateString()) {
    this.earnings.dailyStreak += 1;
    bonus += Math.min(this.earnings.dailyStreak * 2, 50); // Max 50 bonus
  } else {
    this.earnings.dailyStreak = 1;
  }

  this.applyTransaction('earned', bonus, 'Daily login bonus');
  this.earnings.lastEarningDate = new Date();

  await this.save();

  return { earned: bonus, streak: this.earnings.dailyStreak };
};

const UserCurrency = mongoose.models.UserCurrency
  || mongoose.model('UserCurrency', userCurrencySchema);

export default UserCurrency;