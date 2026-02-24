import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const checkAIAnalysis = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Direct query without models
    const db = mongoose.connection.db;
    
    // Find Social Media debate
    const debate = await db.collection('debates').findOne(
      { topic: /social media/i },
      { sort: { createdAt: -1 } }
    );

    if (!debate) {
      console.log('❌ No "Social Media" debate found\n');
      const allDebates = await db.collection('debates').find().limit(10).toArray();
      console.log('📋 Available debates:');
      allDebates.forEach((d, idx) => {
        console.log(`   ${idx + 1}. ${d.topic} (${d.status}) - ${d._id}`);
      });
      process.exit(1);
    }

    console.log(`📊 Debate: "${debate.topic}"`);
    console.log(`   ID: ${debate._id}`);
    console.log(`   Status: ${debate.status}`);
    console.log(`   Turns array: ${debate.turns?.length || 0} IDs stored\n`);

    // Check turns collection directly
    const turns = await db.collection('debateturns').find(
      { debate: debate._id }
    ).sort({ createdAt: 1 }).toArray();

    console.log(`📝 Turns in database: ${turns.length}\n`);

    if (turns.length === 0) {
      console.log('❌ NO TURNS FOUND IN DATABASE');
      console.log('   This means turns are NOT being saved!\n');
      
      // Check if any turns exist at all
      const totalTurns = await db.collection('debateturns').countDocuments();
      console.log(`   Total turns in entire collection: ${totalTurns}\n`);
      
      if (totalTurns > 0) {
        console.log('   Sample turns from other debates:');
        const sampleTurns = await db.collection('debateturns').find().limit(3).toArray();
        sampleTurns.forEach((t, idx) => {
          console.log(`   ${idx + 1}. Debate: ${t.debate}, Side: ${t.side}, Has AI: ${!!t.aiAnalysis}`);
        });
      }
      
      process.exit(1);
    }

    // Check each turn
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      console.log(`─────────────────────────────────────────────`);
      console.log(`Turn ${i + 1} (${turn.side}) - Round ${turn.round}`);
      console.log(`Turn Number: ${turn.turnNumber || 'N/A'}`);
      console.log(`Author ID: ${turn.author}`);
      console.log(`Content: ${turn.content.substring(0, 60)}...`);
      console.log(`\n🤖 AI Analysis:`);

      if (!turn.aiAnalysis) {
        console.log(`   ❌ NO AI ANALYSIS\n`);
        continue;
      }

      console.log(`   ✅ EXISTS`);
      console.log(`   Quality: ${turn.aiAnalysis.overallQuality || 'N/A'}`);
      console.log(`   Tone: ${turn.aiAnalysis.toneScore || 'N/A'}`);
      console.log(`   Clarity: ${turn.aiAnalysis.clarityScore || 'N/A'}`);
      
      if (turn.aiAnalysis.decisionTrace) {
        console.log(`   Decision Trace: ✓ (${typeof turn.aiAnalysis.decisionTrace})`);
        if (typeof turn.aiAnalysis.decisionTrace === 'object') {
          const keys = Object.keys(turn.aiAnalysis.decisionTrace);
          console.log(`   Trace Keys: ${keys.join(', ')}`);
        }
      } else {
        console.log(`   Decision Trace: ✗ MISSING`);
      }
      
      console.log();
    }

    console.log(`─────────────────────────────────────────────`);
    console.log(`\n✅ Summary:`);
    console.log(`   Turns found: ${turns.length}`);
    console.log(`   With AI analysis: ${turns.filter(t => t.aiAnalysis).length}`);
    console.log(`   With decision trace: ${turns.filter(t => t.aiAnalysis?.decisionTrace).length}\n`);

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkAIAnalysis();