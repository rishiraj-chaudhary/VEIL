/**
 * TEST: PerceptionGraph
 * Run: node test-perception.js
 * 
 * Requires: MongoDB running, .env configured, at least one user with received Slicks
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

import Slick from './src/models/slick.js';
import User from './src/models/user.js';
import perceptionGraph from './src/services/graph/perceptionGraph.js';

const log = (label, data) => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${label}`);
  console.log(JSON.stringify(data, null, 2));
};

const fail = (label, error) => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`❌ ${label}`);
  console.log(error.message);
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔌 Connected to MongoDB\n');

  // ── TEST 1: Find a user with received Slicks ──────────────────
  console.log('🧪 TEST 1: Finding user with Slicks...');
  try {
    const slick = await Slick.findOne({ isActive: true }).lean();
    if (!slick) {
      console.log('⚠️  No Slicks found in DB. Creating mock test instead...');
      await testWithMockUser();
    } else {
      const userId = slick.targetUser;
      log('Found user with Slicks', { userId });
      await testWithUser(userId);
    }
  } catch (e) {
    fail('Finding user', e);
  }

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected');
}

async function testWithUser(userId) {

  // ── TEST 2: Run perception graph (no persist) ─────────────────
  console.log('\n🧪 TEST 2: Running PerceptionGraph (persist=false)...');
  try {
    const result = await perceptionGraph.run(userId, {
      lookbackDays: 90, // wider window for testing
      persist: false,
    });

    log('PerceptionGraph result shape', {
      userId: result.userId,
      slickCount: result.slickCount,
      hasPerceptionTraits: !!result.perceptionTraits,
      trend: result.trend,
      hasSummary: !!result.summary,
      hasSelfGap: !!result.selfGap,
      coachingInsightCount: result.coachingInsights?.length,
      toneBreakdown: result.toneBreakdown,
    });

    // ── TEST 3: Validate trait shape ──────────────────────────────
    console.log('\n🧪 TEST 3: Validating perception trait shape...');
    if (result.perceptionTraits) {
      const required = ['tone', 'aggressiveness', 'empathy', 'formality', 'humor', 'argumentativeStyle'];
      const missing = required.filter(k => result.perceptionTraits[k] == null);
      if (missing.length === 0) {
        log('Trait shape valid', result.perceptionTraits);
      } else {
        fail('Trait shape', new Error(`Missing fields: ${missing.join(', ')}`));
      }
    } else {
      console.log('⚠️  No perception traits (not enough Slicks or LLM unavailable)');
    }

    // ── TEST 4: Self-gap ──────────────────────────────────────────
    console.log('\n🧪 TEST 4: Self-gap analysis...');
    if (result.selfGap) {
      log('Self-gap result', {
        gapScore: result.selfGap.gapScore,
        gapCount: result.selfGap.gaps?.length,
        selfTone: result.selfGap.selfTone,
        perceivedTone: result.selfGap.perceivedTone,
        insightCount: result.coachingInsights?.length,
        sampleInsight: result.coachingInsights?.[0],
      });
    } else {
      console.log('⚠️  No self-gap (no PersonaSnapshot exists for this user yet)');
    }

    // ── TEST 5: Persist to User model ─────────────────────────────
    console.log('\n🧪 TEST 5: Persisting perception to User model...');
    try {
      const resultWithPersist = await perceptionGraph.run(userId, {
        lookbackDays: 90,
        persist: true,
      });

      const user = await User.findById(userId)
        .select('perceptionTraits perceptionTrend perceptionSummary perceptionUpdatedAt')
        .lean();

      if (user?.perceptionTraits) {
        log('Persisted to User model ✅', {
          perceptionTrend: user.perceptionTrend,
          perceptionSummary: user.perceptionSummary,
          perceptionUpdatedAt: user.perceptionUpdatedAt,
          traitsStored: Object.keys(user.perceptionTraits),
        });
      } else {
        fail('Persist', new Error('perceptionTraits not found on User after persist'));
      }
    } catch (e) {
      fail('Persist (may need User model patch)', e);
    }

  } catch (e) {
    fail('PerceptionGraph run', e);
  }
}

async function testWithMockUser() {
  // Find any user and test with empty result path
  const user = await User.findOne().lean();
  if (!user) {
    console.log('❌ No users found in DB at all. Seed some data first.');
    return;
  }

  console.log(`\n🧪 Running with user ${user._id} (no Slicks — testing empty path)...`);
  const result = await perceptionGraph.run(user._id, { persist: false });
  log('Empty result (no Slicks)', result);
  console.log('✅ Empty path handled correctly — no crash');
}

run().catch(console.error);