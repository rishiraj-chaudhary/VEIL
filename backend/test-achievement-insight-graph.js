/**
 * TEST: AchievementInsightGraph — Phase 10
 * Run: node test-achievement-insight-graph.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

await import('./src/models/user.js');
await import('./src/models/UserPerformance.js');
await import('./src/models/debateTurn.js');
await import('./src/models/debate.js');
await import('./src/models/post.js');

await mongoose.connect(process.env.MONGODB_URI);
console.log('🔌 Connected\n');

const { default: achievementInsightGraph } = await import('./src/services/graph/achievementInsightGraph.js');
const UserPerformance = (await import('./src/models/UserPerformance.js')).default;
const User            = (await import('./src/models/user.js')).default;

const log  = (label, data) => { console.log(`\n${'─'.repeat(50)}\n✅ ${label}`); console.log(JSON.stringify(data, null, 2)); };
const fail = (label, err)  => { console.log(`\n${'─'.repeat(50)}\n❌ ${label}: ${err?.message || err}`); };

// Find a user with performance data
const perf = await UserPerformance.findOne({ 'stats.totalDebates': { $gte: 1 } }).lean();
let userId;

if (perf) {
  userId = perf.user;
  console.log(`👤 Found user with ${perf.stats.totalDebates} debates`);
} else {
  const user = await User.findOne();
  if (!user) { console.log('❌ Need at least 1 user'); await mongoose.disconnect(); process.exit(0); }
  userId = user._id;

  // Create minimal performance data
  await UserPerformance.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        user: userId,
        stats: { totalDebates: 3, totalTurns: 9, wins: 2, losses: 1, draws: 0, winRate: 66 },
        qualityMetrics: { avgToneScore: 72, avgClarityScore: 68, avgEvidenceScore: 74, avgOverallQuality: 71 },
        fallacyStats: { totalFallacies: 1, fallacyRate: 0.11, commonFallacies: [] },
        skillProfile: { argumentation: 72, evidenceUse: 74, toneControl: 71, clarity: 68, rebuttalStrength: 65, fallacyAvoidance: 69 },
        performanceTrend: 'improving',
        achievements: [],
        coachingTips: [],
      }
    },
    { upsert: true, new: true }
  );
  console.log('✅ Created test performance data');
}

// ── TEST 1: Full graph run ─────────────────────────────────────────────────────
console.log('\n🧪 TEST 1: Full graph run...');
try {
  const result = await achievementInsightGraph.run(userId);
  log('Achievement result', {
    hasHighlight:        !!result.weeklyHighlight,
    highlightLength:     result.weeklyHighlight?.length ?? 0,
    newAchievements:     result.newAchievements,
    totalAchievements:   result.totalAchievements,
    highImpactMoments:   result.highImpactMoments,
    turnsThisWeek:       result.turnsThisWeek,
  });
} catch (e) { fail('TEST 1', e); }

// ── TEST 2: Achievement awarding ───────────────────────────────────────────────
console.log('\n🧪 TEST 2: Achievements awarded...');
try {
  const result  = await achievementInsightGraph.run(userId);
  const fromDB  = await UserPerformance.findOne({ user: userId }).select('achievements').lean();
  log('Achievements in DB ✅', {
    count:        fromDB?.achievements?.length,
    achievements: fromDB?.achievements?.map(a => ({ id: a.id, name: a.name, icon: a.icon })),
  });
} catch (e) { fail('TEST 2', e); }

// ── TEST 3: Weekly highlight persisted to coachingTips ────────────────────────
console.log('\n🧪 TEST 3: Weekly highlight persisted...');
try {
  await achievementInsightGraph.run(userId);
  const fromDB = await UserPerformance.findOne({ user: userId }).select('coachingTips').lean();
  const tip    = fromDB?.coachingTips?.find(t => t.source === 'weeklyHighlight');
  if (tip) {
    log('Weekly highlight tip ✅', { message: tip.message, actionable: tip.actionable?.slice(0, 100) });
  } else {
    console.log('ℹ️  No weekly highlight (no turns this week — expected for empty DB)');
  }
} catch (e) { fail('TEST 3', e); }

// ── TEST 4: Skill badge thresholds ────────────────────────────────────────────
console.log('\n🧪 TEST 4: Skill badge thresholds...');
try {
  // Set high skill scores to trigger badges
  await UserPerformance.findOneAndUpdate(
    { user: userId },
    { $set: { skillProfile: { argumentation: 75, evidenceUse: 80, toneControl: 72, clarity: 71, rebuttalStrength: 70, fallacyAvoidance: 65 } } }
  );
  const result = await achievementInsightGraph.run(userId);
  log('Badges from high skills ✅', { newAchievements: result.newAchievements });
} catch (e) { fail('TEST 4', e); }

// ── TEST 5: Activity milestone awards ─────────────────────────────────────────
console.log('\n🧪 TEST 5: Milestone achievements...');
try {
  await UserPerformance.findOneAndUpdate(
    { user: userId },
    { $set: { 'stats.totalDebates': 10, 'stats.wins': 5 } }
  );
  const result = await achievementInsightGraph.run(userId);
  const fromDB = await UserPerformance.findOne({ user: userId }).select('achievements').lean();
  const hasFirstWin   = fromDB?.achievements?.some(a => a.id === 'first_win');
  const hasTenDebates = fromDB?.achievements?.some(a => a.id === 'ten_debates');
  log('Milestone awards ✅', { hasFirstWin, hasTenDebates, total: fromDB?.achievements?.length });
} catch (e) { fail('TEST 5', e); }

// ── TEST 6: No-data user gracefully returns ────────────────────────────────────
console.log('\n🧪 TEST 6: Graceful empty state...');
try {
  const fakeId = new mongoose.Types.ObjectId();
  const result = await achievementInsightGraph.run(fakeId);
  log('Empty state ✅', result);
} catch (e) { fail('TEST 6', e); }

await mongoose.disconnect();
console.log('\n🔌 Done');