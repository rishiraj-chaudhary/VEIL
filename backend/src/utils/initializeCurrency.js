import User from '../models/user.js';
import UserCurrency from '../models/userCurrency.js';

// Function to initialize currency for existing users
export const initializeUserCurrency = async () => {
  try {
    console.log('🪙 Initializing currency for existing users...');
    
    const users = await User.find({});
    let initialized = 0;

    for (const user of users) {
      const existingCurrency = await UserCurrency.findOne({ user: user._id });
      
      if (!existingCurrency) {
        await UserCurrency.create({
          user: user._id,
          veilCoins: parseInt(process.env.INITIAL_VEIL_COINS) || 100
        });
        initialized++;
      }
    }

    console.log(`✅ Initialized currency for ${initialized} users`);
    return initialized;

  } catch (error) {
    console.error('Currency initialization error:', error);
    return 0;
  }
};