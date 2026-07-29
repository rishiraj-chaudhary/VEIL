/**
 * CLAIM AUTHORSHIP BACKFILL — run once
 *
 * Claims recorded before authorship tracking have no `author`, which leaves them
 * invisible to a user's argument track record. The author is recoverable: every
 * claim references the turn it first appeared in, and every turn has an author.
 *
 * Run: node scripts/backfillClaimAuthors.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
console.log('🔌 Connected\n');

const Claim = (await import('../src/models/Claim.js')).default;
await import('../src/models/debateTurn.js');

const claims = await Claim.find({ $or: [{ author: null }, { author: { $exists: false } }] })
  .populate('firstTurn', 'author')
  .populate('debates.turn', 'author');

console.log(`📊 ${claims.length} claims missing authorship\n`);

let resolved = 0;
let unresolved = 0;

for (const claim of claims) {
  const author = claim.firstTurn?.author;

  if (!author) {
    unresolved += 1;
    continue;
  }

  const usageUpdates = claim.debates.map(entry => entry.turn?.author || author);

  await Claim.updateOne(
    { _id: claim._id },
    {
      $set: {
        author,
        ...Object.fromEntries(usageUpdates.map((user, i) => [`debates.${i}.user`, user])),
      },
    },
  );

  resolved += 1;
}

console.log(`✅ Backfilled ${resolved} claims`);
if (unresolved > 0) {
  console.log(`⚠️  ${unresolved} claims left unattributed (originating turn was deleted)`);
}

// Claims created before the resilience fields existed have no defaults, which
// makes them invisible to reputation averaging (`$avg` over a missing path is
// null). Seed the neutral starting values so they participate.
const seeded = await Claim.updateMany(
  { 'stats.claimResilienceScore': { $exists: false } },
  {
    $set: {
      'stats.refutationCount': 0,
      'stats.refutationSuccessRate': 0,
      'stats.averageRebuttalQuality': 0,
      'stats.claimResilienceScore': 100,
    },
  },
);

console.log(`✅ Seeded resilience defaults on ${seeded.modifiedCount} claims`);

await mongoose.disconnect();
