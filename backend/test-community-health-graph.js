/**
 * TEST: CommunityHealthGraph — Phase 9
 * Run: node test-community-health-graph.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

await import('./src/models/user.js');
await import('./src/models/community.js');
await import('./src/models/post.js');
await import('./src/models/comment.js');

await mongoose.connect(process.env.MONGODB_URI);
console.log('🔌 Connected\n');

const { default: communityHealthGraph } = await import('./src/services/graph/communityHealthGraph.js');
const Community = (await import('./src/models/community.js')).default;
const Post      = (await import('./src/models/post.js')).default;
const Comment   = (await import('./src/models/comment.js')).default;

const log  = (label, data) => { console.log(`\n${'─'.repeat(50)}\n✅ ${label}`); console.log(JSON.stringify(data, null, 2)); };
const fail = (label, err)  => { console.log(`\n${'─'.repeat(50)}\n❌ ${label}: ${err?.message || err}`); };

// Find community with posts
const communities = await Community.find({ isActive: true }).lean();
let target = null;
for (const c of communities) {
  const count = await Post.countDocuments({ community: c._id, isDeleted: false });
  if (count >= 2) { target = c; break; }
}

if (!target) {
  console.log('⚠️  No community with 2+ posts. Run test-community-memory-graph.js first.');
  await mongoose.disconnect();
  process.exit(0);
}

const communityId = target._id;
console.log(`🏘️  Testing with: "${target.displayName}" (c/${target.name})`);

// ── TEST 1: Full graph run ─────────────────────────────────────────────────────
console.log('\n🧪 TEST 1: Full graph run...');
try {
  const result = await communityHealthGraph.run(communityId, { force: true });
  log('Health result', {
    healthScore:            result.healthScore,
    riskLevel:              result.riskLevel,
    toxicityTrend:          result.toxicityTrend,
    participationImbalance: result.participationImbalance,
    escalationRate:         result.escalationRate,
    hasIntervention:        !!result.interventionSuggestion,
  });
} catch (e) { fail('TEST 1', e); }

// ── TEST 2: Health score is valid ─────────────────────────────────────────────
console.log('\n🧪 TEST 2: Health score valid range...');
try {
  const result = await communityHealthGraph.run(communityId);
  const valid  = typeof result.healthScore === 'number' && result.healthScore >= 0 && result.healthScore <= 100;
  if (valid) {
    log('Health score valid ✅', { healthScore: result.healthScore, riskLevel: result.riskLevel });
  } else {
    fail('TEST 2', new Error(`Invalid healthScore: ${result.healthScore}`));
  }
} catch (e) { fail('TEST 2', e); }

// ── TEST 3: Toxicity trend ────────────────────────────────────────────────────
console.log('\n🧪 TEST 3: Toxicity trend...');
try {
  const result = await communityHealthGraph.run(communityId);
  const validTrends = ['rising', 'stable', 'falling'];
  if (validTrends.includes(result.toxicityTrend)) {
    log('Toxicity trend ✅', { trend: result.toxicityTrend, rate: result.toxicityRate });
  } else {
    fail('TEST 3', new Error(`Invalid trend: ${result.toxicityTrend}`));
  }
} catch (e) { fail('TEST 3', e); }

// ── TEST 4: Participation imbalance ───────────────────────────────────────────
console.log('\n🧪 TEST 4: Participation imbalance...');
try {
  const result = await communityHealthGraph.run(communityId);
  const valid  = typeof result.participationImbalance === 'number';
  if (valid) {
    log('Participation ✅', {
      imbalance:          result.participationImbalance,
      uniqueContributors: result.uniqueContributors,
      dominantUserShare:  result.dominantUserShare,
    });
  } else {
    fail('TEST 4', new Error('No participation data'));
  }
} catch (e) { fail('TEST 4', e); }

// ── TEST 5: Persisted to Community ────────────────────────────────────────────
console.log('\n🧪 TEST 5: Persisted to Community model...');
try {
  await communityHealthGraph.run(communityId, { force: true });
  const fromDB  = await Community.findById(communityId).select('healthAnalysis').lean();
  const stored  = fromDB?.healthAnalysis;
  if (stored?.analysedAt && stored?.healthScore !== null) {
    log('Persisted ✅', { healthScore: stored.healthScore, riskLevel: stored.riskLevel, analysedAt: stored.analysedAt });
  } else {
    fail('TEST 5', new Error('healthAnalysis not persisted'));
  }
} catch (e) { fail('TEST 5', e); }

// ── TEST 6: Cache works ────────────────────────────────────────────────────────
console.log('\n🧪 TEST 6: Cache behaviour...');
try {
  const start   = Date.now();
  const result  = await communityHealthGraph.run(communityId);
  const elapsed = Date.now() - start;
  log('Cache hit ✅', { elapsed: `${elapsed}ms`, fromCache: elapsed < 300, healthScore: result.healthScore });
} catch (e) { fail('TEST 6', e); }

await mongoose.disconnect();
console.log('\n🔌 Done');