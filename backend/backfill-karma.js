/**
 * KARMA BACKFILL — run once
 * Calculates karma for all existing users from their posts + debate performance
 *
 * Run: node backfill-karma.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

await import('./src/models/user.js');
await import('./src/models/post.js');
await import('./src/models/UserPerformance.js');

await mongoose.connect(process.env.MONGODB_URI);
console.log('🔌 Connected\n');

const User         = (await import('./src/models/user.js')).default;
const karmaService = (await import('./src/services/karmaService.js')).default;

const users = await User.find({ isActive: true }).select('_id username karma').lean();
console.log(`👤 Found ${users.length} users\n`);

for (const user of users) {
  try {
    const result = await karmaService.recalculate(user._id);
    const change  = result.total - (user.karma || 0);
    const arrow   = change > 0 ? '↑' : change < 0 ? '↓' : '=';
    console.log(`${arrow} ${user.username.padEnd(20)} total: ${result.total} (posts: ${result.postKarma}, debates: ${result.debateKarma})`);
  } catch (err) {
    console.log(`✗ ${user.username}: ${err.message}`);
  }
}

await mongoose.disconnect();
console.log('\n✅ Backfill complete — refresh the leaderboard');