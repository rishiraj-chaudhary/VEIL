/**
 * TEST: PerformanceGraph — Step 11
 * Run: node test-performance-graph.js
 *
 * Requires: MongoDB running, .env configured, Grok API key set
 * Needs: at least one user with DebateTurns in the DB
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

import DebateTurn from './src/models/DebateTurn.js';
import PersonaSnapshot from './src/models/PersonaSnapshot.js';
import UserPerformance from './src/models/UserPerformance.js';
import performanceGraph from './src/services/graph/performanceGraph.js';

const log = (label, data) => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${label}`);
  console.log(JSON.stringify(data, null, 2));
};

const fail = (label, error) => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`❌ ${label}`);
  console.log(error?.message || error);
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔌 Connected to MongoDB\n');

  // ── Find a user with debate turns ──────────────────────────────────────
  const turn = await DebateTurn.findOne({
    'aiAnalysis.overallQuality': { $exists: true },
    isDeleted: false,
  }).lean();

  if (!turn) {
    console.log('⚠️  No analysed DebateTurns found. Complete a debate first.');
    await mongoose.disconnect();
    return;
  }

  const userId = turn.author;
  const turnCount = await DebateTurn.countDocuments({ author: userId, isDeleted: false });
  console.log(`👤 Testing with user: ${userId}`);
  console.log(`   Turns in DB: ${turnCount}`);

  const snapshot = await PersonaSnapshot.findOne({ userId }).sort({ timestamp: -1 }).lean();
  console.log(`   Has PersonaSnapshot: ${!!snapshot} ${snapshot ? `(${snapshot.traits?.tone} / ${snapshot.traits?.argumentativeStyle})` : ''}`);

  // ── TEST 1: Dry run (persist=false) ────────────────────────────────────
  console.log('\n🧪 TEST 1: Dry run (persist=false)...');
  try {
    const result = await performanceGraph.run(userId, { lookbackTurns: 20, persist: false });

    log('Graph result shape', {
      turnCount:         result.turnCount,
      hasSkillProfile:   !!result.skillProfile && Object.keys(result.skillProfile).length > 0,
      trend:             result.trend,
      skillDeltas:       result.skillDeltas,
      improvingSkills:   result.improvingSkills,
      decliningSkills:   result.decliningSkills,
      blindSpotCount:    result.blindSpots?.length,
      alignedCount:      result.personaAligned?.length,
      hasPeerPercentiles: !!result.peerPercentiles,
      hasCoachingPlan:   !!result.coachingPlan,
      newAchievements:   result.newAchievements?.length,
    });
  } catch (e) {
    fail('TEST 1 — Dry run', e);
  }

  // ── TEST 2: Skill profile shape validation ─────────────────────────────
  console.log('\n🧪 TEST 2: Skill profile shape...');
  try {
    const result = await performanceGraph.run(userId, { lookbackTurns: 20, persist: false });
    const required = ['argumentation', 'evidenceUse', 'toneControl', 'clarity', 'rebuttalStrength', 'fallacyAvoidance'];
    const missing  = required.filter(k => result.skillProfile?.[k] == null);

    if (missing.length === 0) {
      log('All 6 skill dimensions present ✅', result.skillProfile);
    } else {
      fail('Skill shape', new Error(`Missing: ${missing.join(', ')}`));
    }

    // Sanity: all scores 0–100
    const outOfRange = Object.entries(result.skillProfile || {}).filter(([, v]) => v < 0 || v > 100);
    if (outOfRange.length === 0) {
      console.log('✅ All scores in 0–100 range');
    } else {
      console.log(`⚠️  Out-of-range scores: ${outOfRange.map(([k, v]) => `${k}:${v}`).join(', ')}`);
    }
  } catch (e) {
    fail('TEST 2 — Skill shape', e);
  }

  // ── TEST 3: Blind spot detection ───────────────────────────────────────
  console.log('\n🧪 TEST 3: Blind spot detection...');
  try {
    const result = await performanceGraph.run(userId, { lookbackTurns: 20, persist: false });

    if (snapshot) {
      log('Blind spot result', {
        blindSpotCount: result.blindSpots?.length,
        blindSpots: result.blindSpots?.map(b => ({
          trait:      b.trait,
          skill:      b.skill,
          skillScore: b.skillScore,
          insight:    b.insight?.substring(0, 80) + '...',
        })),
        alignedCount: result.personaAligned?.length,
        aligned:      result.personaAligned,
      });
    } else {
      console.log('⚠️  No PersonaSnapshot — blind spots skipped (expected)');
      console.log(`   blindSpots: ${result.blindSpots?.length ?? 0}`);
    }
  } catch (e) {
    fail('TEST 3 — Blind spots', e);
  }

  // ── TEST 4: Coaching plan ─────────────────────────────────────────────
  console.log('\n🧪 TEST 4: LLM coaching plan generation...');
  try {
    const result = await performanceGraph.run(userId, { lookbackTurns: 20, persist: false });

    if (result.coachingPlan) {
      log('Coaching plan ✅', {
        focusArea:  result.coachingPlan.focusArea,
        weeklyGoal: result.coachingPlan.weeklyGoal,
        drillCount: result.coachingPlan.drills?.length,
        drills:     result.coachingPlan.drills?.map(d => ({
          skill:      d.skill,
          title:      d.title,
          difficulty: d.difficulty,
        })),
      });
    } else {
      console.log('⚠️  No coaching plan generated (Grok may be unavailable)');
    }
  } catch (e) {
    fail('TEST 4 — Coaching plan', e);
  }

  // ── TEST 5: Persist to UserPerformance ────────────────────────────────
  console.log('\n🧪 TEST 5: Persist to UserPerformance model...');
  try {
    await performanceGraph.run(userId, { lookbackTurns: 20, persist: true });

    const perf = await UserPerformance.findOne({ user: userId })
      .select('skillProfile performanceTrend peerPercentiles analysis.blindSpots coachingTips snapshots')
      .lean();

    if (perf?.skillProfile?.argumentation != null) {
      log('Persisted to UserPerformance ✅', {
        skillProfile:    perf.skillProfile,
        performanceTrend: perf.performanceTrend,
        hasPeerPercentiles: !!perf.peerPercentiles?.argumentation,
        blindSpotCount:  perf.analysis?.blindSpots?.length,
        graphTipCount:   perf.coachingTips?.filter(t => t.source === 'performanceGraph').length,
        snapshotCount:   perf.snapshots?.length,
        latestSnapshotHasSkillProfile: !!perf.snapshots?.slice(-1)[0]?.skillProfile,
      });
    } else {
      fail('Persist', new Error('skillProfile not found on UserPerformance after persist'));
    }
  } catch (e) {
    fail('TEST 5 — Persist', e);
  }

  // ── TEST 6: Trend detection (run twice) ───────────────────────────────
  console.log('\n🧪 TEST 6: Trend detection (requires 2 runs)...');
  try {
    const result = await performanceGraph.run(userId, { lookbackTurns: 20, persist: false });

    log('Trend result', {
      trend:           result.trend,
      skillDeltas:     result.skillDeltas,
      improvingSkills: result.improvingSkills,
      decliningSkills: result.decliningSkills,
    });

    const validTrends = ['improving', 'plateau', 'declining', 'inconsistent', 'stable', 'new'];
    if (validTrends.includes(result.trend)) {
      console.log(`✅ Trend "${result.trend}" is valid`);
    } else {
      console.log(`⚠️  Unexpected trend value: ${result.trend}`);
    }
  } catch (e) {
    fail('TEST 6 — Trend detection', e);
  }

  // ── TEST 7: aiCoachService integration ────────────────────────────────
  console.log('\n🧪 TEST 7: getPerformanceSummary includes new fields...');
  try {
    // Register User schema before aiCoachService tries to populate it
    await import("./src/models/user.js");
    const aiCoachService = (await import('./src/services/aiCoachService.js')).default;
    const summary = await aiCoachService.getPerformanceSummary(userId);

    if (summary.hasData) {
      log('Summary includes Step 11 fields ✅', {
        hasSkillProfile:    !!summary.skillProfile,
        performanceTrend:   summary.performanceTrend,
        blindSpotCount:     summary.blindSpots?.length,
        alignedCount:       summary.personaAligned?.length,
        hasPeerPercentiles: !!summary.peerPercentiles,
        coachingTipCount:   summary.coachingTips?.length,
        graphTipCount:      summary.coachingTips?.filter(t => t.source === 'performanceGraph').length,
      });
    } else {
      console.log('⚠️  No data returned from getPerformanceSummary');
    }
  } catch (e) {
    fail('TEST 7 — aiCoachService integration', e);
  }

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected\n');
}

run().catch(console.error);