/**
 * TEST: DebateTurnGraph — persona injection in debates
 * Run: node test-debate-turn-graph.js
 *
 * Requires: MongoDB running, .env configured, Grok API key set
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

import PersonaSnapshot from './src/models/PersonaSnapshot.js';
import debateTurnGraph from './src/services/graph/debateTurnGraph.js';
import vectorStoreService from './src/services/vectorStoreService.js';

const log = (label, data) => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${label}`);
  console.log(JSON.stringify(data, null, 2));
};

const fail = (label, error) => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`❌ ${label}`);
  console.log(error.message || error);
};

// ── Sample debate content ─────────────────────────────────────────
const SAMPLE_TURNS = {
  goodArgument: `Renewable energy is not just an environmental imperative but an economic opportunity. 
    According to the International Energy Agency (2023), solar costs have dropped 89% in the last decade. 
    Moreover, the renewable sector now employs more workers than fossil fuels in the United States. 
    Therefore, transitioning to clean energy creates jobs while addressing climate change.`,

  poorArgument: `You're completely wrong and you don't understand anything about energy. 
    Everyone knows fossil fuels are bad and anyone who thinks otherwise is an idiot. 
    This is totally obvious and I can't believe we're even debating this.`,

  averageArgument: `I think renewable energy is probably better for the environment. 
    There might be some economic benefits too. It seems like a good idea overall 
    and most people would probably agree with this position.`,
};

const PREVIOUS_TURNS = [
  {
    side: 'against',
    content: 'Fossil fuels remain essential for energy security and economic stability. The transition costs are enormous and would devastate working-class communities dependent on these industries.',
  }
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔌 Connected to MongoDB\n');

  // Initialize vector store (optional — graph works without it)
  try {
    await vectorStoreService.initialize();
    const stats = await vectorStoreService.getStats();
    debateTurnGraph.setVectorStore(vectorStoreService, stats.initialized && stats.hasKnowledgeStore);
    console.log(`📚 Vector store: ${stats.initialized ? 'ready' : 'unavailable'}`);
  } catch {
    console.log('⚠️  Vector store unavailable — RAG disabled for this test');
    debateTurnGraph.setVectorStore(null, false);
  }

  // ── Find a user with a PersonaSnapshot for persona injection test ──
  const snapshot = await PersonaSnapshot.findOne().sort({ timestamp: -1 }).lean();
  const testUserId = snapshot?.userId || null;

  if (testUserId) {
    console.log(`👤 Found user with PersonaSnapshot: ${testUserId}`);
    console.log(`   Traits: ${snapshot.traits?.tone} / ${snapshot.traits?.argumentativeStyle}`);
  } else {
    console.log('⚠️  No PersonaSnapshot found — persona injection will be skipped (null persona path)');
  }

  // ── TEST 1: Graph runs without crashing ───────────────────────
  console.log('\n🧪 TEST 1: Basic graph execution (good argument)...');
  try {
    const result = await debateTurnGraph.run(
      SAMPLE_TURNS.goodArgument,
      'for',
      PREVIOUS_TURNS,
      testUserId,
      null,
      'free'
    );

    log('Graph result shape', {
      hasClaims: Array.isArray(result.claims),
      claimCount: result.claims?.length,
      hasRebuttals: Array.isArray(result.rebuttals),
      hasFallacies: Array.isArray(result.fallacies),
      toneScore: result.toneScore,
      clarityScore: result.clarityScore,
      evidenceScore: result.evidenceQuality,
      overallQuality: result.overallQuality,
      decisionTraceSteps: result.decisionTrace?.length,
      hasPersonaContext: !!result.personaContext,
    });

    // ── TEST 2: Validate decision trace has all 13 nodes ──────────
    console.log('\n🧪 TEST 2: Decision trace completeness...');
    const steps = result.decisionTrace?.map(t => t.step) || [];
    const expectedSteps = [
      'initialization', 'persona_loaded', 'fallacy_detection',
      'claims_extraction', 'rebuttal_analysis', 'tone_analysis',
      'clarity_analysis', 'evidence_analysis', 'overall_quality', 'summary'
    ];
    const foundSteps = expectedSteps.filter(s => steps.includes(s));
    const missingSteps = expectedSteps.filter(s => !steps.includes(s));

    log('Decision trace steps', {
      found: foundSteps,
      missing: missingSteps.length > 0 ? missingSteps : 'none — all present ✅',
      totalSteps: steps.length,
      allSteps: steps,
    });

  } catch (e) {
    fail('TEST 1 — Basic execution', e);
  }

  // ── TEST 3: Persona injection ─────────────────────────────────
  console.log('\n🧪 TEST 3: Persona context injection...');
  try {
    const result = await debateTurnGraph.run(
      SAMPLE_TURNS.goodArgument,
      'for',
      [],
      testUserId,
      null,
      'pro'
    );

    if (result.personaContext) {
      log('Persona injected into result ✅', {
        tone: result.personaContext.tone,
        driftScore: result.personaContext.driftScore,
        driftDirection: result.personaContext.driftDirection,
        coachingTipCount: result.personaContext.coaching?.length,
        sampleTip: result.personaContext.coaching?.[0],
      });

      // Check drift warning appears in tone trace when aggressive
      const toneStep = result.decisionTrace?.find(t => t.step === 'tone_analysis');
      if (toneStep?.data?.driftWarning) {
        log('Drift warning in tone analysis ✅', { driftWarning: toneStep.data.driftWarning });
      } else {
        console.log('ℹ️  No drift warning (user not trending aggressive — expected)');
      }

      // Check persona weights applied in quality step
      const qualityStep = result.decisionTrace?.find(t => t.step === 'overall_quality');
      log('Persona weights in quality calculation', {
        personaWeightsApplied: qualityStep?.data?.personaWeightsApplied,
        breakdown: qualityStep?.data?.breakdown,
        driftTips: qualityStep?.data?.driftCoachingTips,
      });
    } else {
      console.log('⚠️  No persona context (no PersonaSnapshot for this user)');
    }
  } catch (e) {
    fail('TEST 3 — Persona injection', e);
  }

  // ── TEST 4: Fallacy detection on poor argument ────────────────
  console.log('\n🧪 TEST 4: Fallacy detection (poor argument)...');
  try {
    const result = await debateTurnGraph.run(
      SAMPLE_TURNS.poorArgument,
      'for',
      [],
      null,
      null,
      'free'
    );

    log('Fallacy detection result', {
      fallacyCount: result.fallacies?.length,
      fallacies: result.fallacies?.map(f => ({
        type: f.type,
        severity: f.severity,
        confidence: f.confidence,
        detectionMethod: f.detectionMethod,
      })),
      toneScore: result.toneScore,
      overallQuality: result.overallQuality,
    });

    if (result.fallacies?.length === 0) {
      console.log('⚠️  No fallacies detected — check if Grok API is configured');
    }
  } catch (e) {
    fail('TEST 4 — Fallacy detection', e);
  }

  // ── TEST 5: Score comparison across argument quality ──────────
  console.log('\n🧪 TEST 5: Score comparison (good vs poor vs average)...');
  try {
    const results = await Promise.all([
      debateTurnGraph.run(SAMPLE_TURNS.goodArgument, 'for', [], null, null, 'free'),
      debateTurnGraph.run(SAMPLE_TURNS.averageArgument, 'for', [], null, null, 'free'),
      debateTurnGraph.run(SAMPLE_TURNS.poorArgument, 'for', [], null, null, 'free'),
    ]);

    log('Score comparison', {
      good:    { overall: results[0].overallQuality, tone: results[0].toneScore, evidence: results[0].evidenceQuality },
      average: { overall: results[1].overallQuality, tone: results[1].toneScore, evidence: results[1].evidenceQuality },
      poor:    { overall: results[2].overallQuality, tone: results[2].toneScore, evidence: results[2].evidenceQuality },
    });

    // Good should score higher than poor
    if (results[0].overallQuality > results[2].overallQuality) {
      console.log('✅ Scoring correctly orders good > poor arguments');
    } else {
      console.log('⚠️  Scoring may not be differentiating well — check weights');
    }
  } catch (e) {
    fail('TEST 5 — Score comparison', e);
  }

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected\n');
}

run().catch(console.error);