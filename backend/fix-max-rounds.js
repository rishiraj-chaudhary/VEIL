import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const fixMaxRounds = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  // Update all debates that don't have maxRounds set
  const result = await db.collection('debates').updateMany(
    { maxRounds: { $exists: false } },
    { $set: { maxRounds: 3 } }
  );
  
  console.log(`✅ Updated ${result.modifiedCount} debates to have maxRounds: 3`);
  
  // Also update debates where maxRounds is null or undefined
  const result2 = await db.collection('debates').updateMany(
    { maxRounds: null },
    { $set: { maxRounds: 3 } }
  );
  
  console.log(`✅ Updated ${result2.modifiedCount} debates with null maxRounds`);
  
  // Show updated debate
  const debate = await db.collection('debates').findOne(
    { _id: new mongoose.Types.ObjectId('698b1773cdfacdb87e294303') }
  );
  
  console.log('\n📊 Current Debate:');
  console.log(`   Max Rounds: ${debate.maxRounds}`);
  console.log(`   Total Turns: ${debate.totalTurns}`);
  console.log(`   Should Complete At: ${debate.maxRounds * 2} turns`);
  console.log(`   Turns Remaining: ${(debate.maxRounds * 2) - debate.totalTurns}`);
  
  await mongoose.disconnect();
};

fixMaxRounds();
