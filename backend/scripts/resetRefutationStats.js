/**
 * RESET REFUTATION STATS — one-off
 *
 * Clears refutation history on claims that were scored before the success
 * criterion was corrected. Those rows recorded almost every rebuttal as a
 * successful refutation (`effectiveness >= 6 || quality >= 65` treated a
 * well-written turn as a decisive one), so their resilience scores are wrong and
 * cannot be recomputed — the per-refutation effectiveness values were never
 * stored, only the aggregate.
 *
 * Only the refutation counters are reset. Claim text, authorship, topic,
 * embeddings, usage history and debate links are untouched, so the claims
 * remain in the graph and simply return to "untested" until challenged again.
 *
 * Run: node scripts/resetRefutationStats.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
console.log('🔌 Connected\n');

const Claim = (await import('../src/models/Claim.js')).default;

const affected = await Claim.find({ 'stats.refutationCount': { $gte: 1 } })
  .select('originalText stats.refutationCount stats.claimResilienceScore')
  .lean();

console.log(`📊 ${affected.length} claims carry refutation history\n`);
affected.forEach(c => console.log(
  `   res=${String(c.stats.claimResilienceScore).padStart(3)} refuted=${c.stats.refutationCount}×  "${c.originalText.slice(0, 50)}"`
));

const result = await Claim.updateMany(
  { 'stats.refutationCount': { $gte: 1 } },
  {
    $set: {
      'stats.refutationCount': 0,
      'stats.refutationSuccesses': 0,
      'stats.refutationSuccessRate': 0,
      'stats.averageRebuttalQuality': 0,
      'stats.timesRefuted': 0,
      'stats.claimResilienceScore': 100, // schema default: untested
      counterClaims: [],
    },
  },
);

console.log(`\n✅ Reset refutation history on ${result.modifiedCount} claims`);
console.log('   Claim text, authorship and usage history were not touched.');
console.log('   Track Record will read "Untested" until these are challenged again.');

await mongoose.disconnect();
