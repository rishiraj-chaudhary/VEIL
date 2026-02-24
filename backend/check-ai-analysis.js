import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const checkDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    // Find Social Media debate
    const debate = await db.collection('debates').findOne(
      { topic: /social media/i },
      { sort: { createdAt: -1 } }
    );

    if (!debate) {
      console.log('❌ No Social Media debate found\n');
      process.exit(1);
    }

    console.log(`📊 Debate: "${debate.topic}"`);
    console.log(`   ID: ${debate._id}`);
    console.log(`   Status: ${debate.status}\n`);

    // Get turns
    const turns = await db.collection('debateturns').find(
      { debate: debate._id }
    ).sort({ createdAt: 1 }).toArray();

    console.log(`📝 Turns found: ${turns.length}\n`);

    if (turns.length === 0) {
      console.log('❌ NO TURNS IN DATABASE!\n');
      process.exit(1);
    }

    // Show each turn
    turns.forEach((turn, i) => {
      console.log(`Turn ${i + 1}: ${turn.side} - Round ${turn.round}`);
      console.log(`  Content: ${turn.content.substring(0, 50)}...`);
      console.log(`  Has AI: ${!!turn.aiAnalysis}`);
      if (turn.aiAnalysis) {
        console.log(`  Quality: ${turn.aiAnalysis.overallQuality || 'N/A'}`);
        console.log(`  Has trace: ${!!turn.aiAnalysis.decisionTrace}`);
      }
      console.log();
    });

    await mongoose.disconnect();

  } catch (error) {
    console.error('Error:', error.message);
  }
};

checkDatabase();
