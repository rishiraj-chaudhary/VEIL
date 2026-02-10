import dotenv from 'dotenv';
import mongoose from 'mongoose';
import AIUsage from './src/models/AIUsage.js';
import User from './src/models/user.js';

dotenv.config();

const createTestData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // ✅ Find user by username 'codemaster'
    let user = await User.findOne({ username: 'codemaster' });
    
    if (!user) {
      console.log('❌ User "codemaster" not found. Available users:');
      const users = await User.find().select('username');
      users.forEach(u => console.log(`   - ${u.username}`));
      process.exit(1);
    }

    console.log(`Creating test data for user: ${user.username} (${user._id})`);

    // Delete existing test data for this user
    const deleted = await AIUsage.deleteMany({ user: user._id });
    console.log(`🗑️  Deleted ${deleted.deletedCount} existing entries`);

    // Create test AI usage entries
    const testData = [];
    const now = new Date();

    for (let i = 0; i < 30; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      // Random operations
      const operations = ['debate_analysis', 'claim_extraction', 'summary_generation', 'live_assistant', 'fact_check'];
      const models = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile'];

      // Random 1-10 calls per day
      const callsToday = Math.floor(Math.random() * 10) + 1;

      for (let j = 0; j < callsToday; j++) {
        const operation = operations[Math.floor(Math.random() * operations.length)];
        const model = models[Math.floor(Math.random() * models.length)];
        const promptTokens = Math.floor(Math.random() * 500) + 100;
        const completionTokens = Math.floor(Math.random() * 300) + 50;
        const totalTokens = promptTokens + completionTokens;

        // Cost calculation (Groq pricing)
        const estimatedCost = (promptTokens * 0.59 + completionTokens * 0.79) / 1000000;

        // Random time for this day
        const callTime = new Date(date);
        callTime.setHours(Math.floor(Math.random() * 24));
        callTime.setMinutes(Math.floor(Math.random() * 60));

        testData.push({
          user: user._id,
          operation,
          model,
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCost,
          responseTime: Math.floor(Math.random() * 3000) + 500,
          cached: Math.random() > 0.8, // 20% cached
          success: true,
          createdAt: callTime
        });
      }
    }

    // Insert test data
    await AIUsage.insertMany(testData);
    console.log(`✅ Created ${testData.length} test AI usage entries for ${user.username}`);

    // Show summary
    const totalCost = testData.reduce((sum, entry) => sum + entry.estimatedCost, 0);
    const totalTokens = testData.reduce((sum, entry) => sum + entry.totalTokens, 0);
    const cachedCount = testData.filter(entry => entry.cached).length;

    console.log('\n📊 Summary:');
    console.log(`   Total Calls: ${testData.length}`);
    console.log(`   Cached Calls: ${cachedCount} (${((cachedCount/testData.length)*100).toFixed(1)}%)`);
    console.log(`   Total Cost: $${totalCost.toFixed(4)}`);
    console.log(`   Total Tokens: ${totalTokens.toLocaleString()}`);
    console.log(`   Avg Cost/Call: $${(totalCost/testData.length).toFixed(6)}`);

    process.exit(0);
  } catch (error) {
    console.error('Error creating test data:', error);
    process.exit(1);
  }
};

createTestData();