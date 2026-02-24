import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const checkTrace = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  const debate = await db.collection('debates').findOne({ topic: /social media/i });
  const turns = await db.collection('debateturns').find({ debate: debate._id }).limit(1).toArray();
  
  console.log('First turn AI Analysis:');
  console.log(JSON.stringify(turns[0].aiAnalysis, null, 2));
  
  await mongoose.disconnect();
};

checkTrace();
