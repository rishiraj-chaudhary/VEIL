/**
 * POST KARMA BACKFILL — run once
 *
 * Votes were previously applied with atomic `$inc`, which bypasses the Post
 * schema's pre('save') karma hook, so `karma` stayed at its default of 0 for
 * every post that was voted on. Hot/Top ranking sorts by that field, so those
 * posts all tied at 0 and the feed degenerated to chronological order.
 *
 * Run: node scripts/backfillPostKarma.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
console.log('🔌 Connected\n');

const Post = (await import('../src/models/post.js')).default;

const result = await Post.updateMany({}, [
  {
    $set: {
      karma: {
        $subtract: [{ $ifNull: ['$upvotes', 0] }, { $ifNull: ['$downvotes', 0] }],
      },
    },
  },
]);

console.log(`✅ Recomputed karma for ${result.modifiedCount} of ${result.matchedCount} posts`);

await mongoose.disconnect();
