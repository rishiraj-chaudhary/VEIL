import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const checkRounds = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  const debate = await db.collection('debates').findOne(
    { _id: new mongoose.Types.ObjectId('698b1773cdfacdb87e294303') }
  );
  
  console.log('\n📊 Debate Info:');
  console.log(`   Topic: ${debate.topic}`);
  console.log(`   Status: ${debate.status}`);
  console.log(`   Current Round: ${debate.currentRound}`);
  console.log(`   Max Rounds: ${debate.maxRounds}`);
  console.log(`   Total Turns: ${debate.totalTurns}`);
  console.log(`   Expected Total Turns: ${debate.maxRounds * 2}`);
  console.log(`   Turns Remaining: ${(debate.maxRounds * 2) - debate.totalTurns}`);
  
  await mongoose.disconnect();
};

checkRounds();
