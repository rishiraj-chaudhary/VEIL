/**
 * CLAIM EMBEDDING BACKFILL — run once
 *
 * Claims created before embeddings were wired in have none, so similarity
 * matching falls back to Jaccard string overlap for them. That fallback is the
 * reason two unrelated claims sharing common words get linked, and it cannot be
 * removed until every claim has a vector.
 *
 * Run: node scripts/backfillClaimEmbeddings.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const BATCH_SIZE = 32;

await mongoose.connect(process.env.MONGODB_URI);
console.log('🔌 Connected\n');

const Claim = (await import('../src/models/Claim.js')).default;
const embeddingService = (await import('../src/services/embeddingService.js')).default;

const missing = await Claim.find({
  $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }],
}).select('_id originalText');

console.log(`📊 ${missing.length} claims without an embedding\n`);

let done = 0;
let failed = 0;

for (let i = 0; i < missing.length; i += BATCH_SIZE) {
  const batch = missing.slice(i, i + BATCH_SIZE);

  try {
    const vectors = await embeddingService.embedDocuments(batch.map(c => c.originalText));

    await Claim.bulkWrite(
      batch
        .map((claim, idx) => (vectors[idx]?.length ? {
          updateOne: { filter: { _id: claim._id }, update: { $set: { embedding: vectors[idx] } } },
        } : null))
        .filter(Boolean),
      { ordered: false },
    );

    done += batch.length;
    console.log(`   ${done}/${missing.length}`);

  } catch (error) {
    failed += batch.length;
    console.error(`   batch failed: ${error.message}`);
  }
}

const remaining = await Claim.countDocuments({
  $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }],
});

console.log(`\n✅ Embedded ${done} claims${failed ? `, ${failed} failed` : ''}`);
console.log(`   remaining without embedding: ${remaining}`);

await mongoose.disconnect();
