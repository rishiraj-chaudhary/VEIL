/**
 * TEST: KnowledgeGraph — embedding-based claim linking + refutation tracking
 * Run: node test-knowledge-graph.js
 *
 * Requires: MongoDB running, .env configured
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

import Claim from './src/models/Claim.js';
import knowledgeGraphService from './src/services/knowledgeGraphService.js';
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

// ── Semantically similar claim pairs (should link, NOT merge) ────
// all-MiniLM-L6-v2 scores paraphrases at 0.45-0.90 — link threshold is 0.45
const SIMILAR_PAIRS = [
  {
    a: 'Solar panels and wind turbines produce clean electricity',
    b: 'Renewable energy sources generate power without emissions',
    expectedLink: true,
  },
  {
    a: 'Universal healthcare provides medical access to all citizens',
    b: 'National health insurance ensures everyone can see a doctor',
    expectedLink: true,
  },
];

// ── Distinct claims (should NOT link) ────────────────────────────
const DISTINCT_CLAIMS = [
  'Renewable energy reduces carbon emissions',
  'Universal basic income reduces poverty',
  'Stricter gun control laws save lives',
];

// ── Refutation test pair ──────────────────────────────────────────
const REFUTATION = {
  original: 'Fossil fuels are essential for economic stability',
  rebuttal: 'Renewable energy now creates more jobs than fossil fuels in most economies',
  effectiveness: 8,
  rebuttalQuality: 75,
};

// Fake debate/turn IDs for testing
const MOCK_DEBATE_ID = new mongoose.Types.ObjectId();
const MOCK_TURN_ID = new mongoose.Types.ObjectId();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔌 Connected to MongoDB\n');

  // Init vector store for embedding support
  try {
    await vectorStoreService.initialize();
    console.log('📚 Vector store initialized — embedding-based linking active');
  } catch {
    console.log('⚠️  Vector store unavailable — will use string similarity fallback');
  }

  // ── TEST 1: Add claims to graph ───────────────────────────────
  console.log('\n🧪 TEST 1: Adding claims to knowledge graph...');
  const addedIds = [];

  for (const text of DISTINCT_CLAIMS) {
    try {
      const claim = await knowledgeGraphService.addClaim(
        text,
        MOCK_DEBATE_ID,
        MOCK_TURN_ID,
        'for',
        72,
        null
      );
      addedIds.push(claim._id);
      console.log(`   ✅ Added: "${text.substring(0, 50)}..." (id: ${claim._id})`);
    } catch (e) {
      fail(`Adding claim: ${text.substring(0, 40)}`, e);
    }
  }

  // ── TEST 2: Duplicate detection (same claim twice) ────────────
  console.log('\n🧪 TEST 2: Duplicate claim detection...');
  try {
    const first = await knowledgeGraphService.addClaim(
      DISTINCT_CLAIMS[0], MOCK_DEBATE_ID, MOCK_TURN_ID, 'for', 65, null
    );
    const second = await knowledgeGraphService.addClaim(
      DISTINCT_CLAIMS[0], MOCK_DEBATE_ID, MOCK_TURN_ID, 'for', 70, null
    );

    if (first._id.equals(second._id)) {
      log('Duplicate detected — same claim merged ✅', {
        claimId: first._id,
        totalUses: second.stats?.totalUses,
      });
    } else {
      console.log('⚠️  Duplicate not merged — check normalizeClaim()');
    }
  } catch (e) {
    fail('TEST 2 — Duplicate detection', e);
  }

  // ── TEST 3: Semantic similarity linking ───────────────────────
  console.log('\n🧪 TEST 3: Semantic claim linking...');
  for (const pair of SIMILAR_PAIRS) {
    try {
      const claimA = await knowledgeGraphService.addClaim(
        pair.a, MOCK_DEBATE_ID, MOCK_TURN_ID, 'for', 70, null
      );
      const claimB = await knowledgeGraphService.addClaim(
        pair.b, MOCK_DEBATE_ID, MOCK_TURN_ID, 'for', 68, null
      );

      // Wait briefly for reverse-link updateOne to complete
      await new Promise(r => setTimeout(r, 200));

      // Check both directions — linking adds reverse link too
      const fetchedA = await Claim.findById(claimA._id).lean();
      const fetchedB = await Claim.findById(claimB._id).lean();

      const isLinkedAtoB = fetchedA?.relatedClaims?.some(r => r.claim.equals(claimB._id));
      const isLinkedBtoA = fetchedB?.relatedClaims?.some(r => r.claim.equals(claimA._id));
      const isLinked = isLinkedAtoB || isLinkedBtoA;

      // Compute raw similarity for debugging
      const embA = fetchedA?.embedding || [];
      const embB = fetchedB?.embedding || [];
      const rawSim = embA.length && embB.length
        ? knowledgeGraphService.cosineSimilarity(embA, embB)
        : null;

      console.log(`   Raw cosine similarity: ${rawSim?.toFixed(3) ?? 'N/A'}`);
      console.log(`   Thresholds: link >= ${knowledgeGraphService.relatedThreshold}, merge >= ${knowledgeGraphService.embeddingThreshold}`);

      if (isLinked) {
        const linkData = isLinkedAtoB
          ? fetchedA.relatedClaims.find(r => r.claim.equals(claimB._id))
          : fetchedB.relatedClaims.find(r => r.claim.equals(claimA._id));
        log('Semantic link found ✅', {
          claimA: pair.a.substring(0, 50),
          claimB: pair.b.substring(0, 50),
          similarity: linkData?.similarity?.toFixed(3),
          relationship: linkData?.relationship,
          method: embA.length > 0 ? 'embedding' : 'string-fallback',
          direction: isLinkedAtoB ? 'A→B' : 'B→A',
        });
      } else {
        console.log(`⚠️  No link (similarity ${rawSim?.toFixed(3) ?? 'unknown'} — check thresholds)`);
      }
    } catch (e) {
      fail(`Semantic linking for pair`, e);
    }
  }

  // ── TEST 4: Persona metadata on claims ───────────────────────
  console.log('\n🧪 TEST 4: Persona metadata storage...');
  try {
    // Find a user with a PersonaSnapshot
    const PersonaSnapshot = (await import('./src/models/PersonaSnapshot.js')).default;
    const snapshot = await PersonaSnapshot.findOne().sort({ timestamp: -1 }).lean();

    if (snapshot) {
      const claimWithPersona = await knowledgeGraphService.addClaim(
        'Evidence-based policy making leads to better governance outcomes',
        MOCK_DEBATE_ID,
        MOCK_TURN_ID,
        'for',
        80,
        snapshot.userId
      );

      const fetched = await Claim.findById(claimWithPersona._id).lean();
      if (fetched?.authorPersona) {
        log('Persona metadata stored on claim ✅', fetched.authorPersona);
      } else {
        console.log('⚠️  No authorPersona stored — check User model patch and PersonaSnapshot exists');
      }
    } else {
      console.log('⚠️  No PersonaSnapshot in DB — skipping persona metadata test');
    }
  } catch (e) {
    fail('TEST 4 — Persona metadata', e);
  }

  // ── TEST 5: Refutation tracking ───────────────────────────────
  console.log('\n🧪 TEST 5: Refutation strength tracking...');
  try {
    // Add both claims first
    await knowledgeGraphService.addClaim(
      REFUTATION.original, MOCK_DEBATE_ID, MOCK_TURN_ID, 'against', 60, null
    );
    await knowledgeGraphService.addClaim(
      REFUTATION.rebuttal, MOCK_DEBATE_ID, MOCK_TURN_ID, 'for', 75, null
    );

    // Mark refutation
    await knowledgeGraphService.markRefuted(
      REFUTATION.original,
      REFUTATION.rebuttal,
      REFUTATION.effectiveness,
      REFUTATION.rebuttalQuality
    );

    // Check resilience score updated
    const normalized = knowledgeGraphService.normalizeClaim(REFUTATION.original);
    const originalClaim = await Claim.findOne({ normalizedText: normalized }).lean();

    if (originalClaim?.stats?.refutationCount > 0) {
      log('Refutation tracking updated ✅', {
        refutationCount: originalClaim.stats.refutationCount,
        refutationSuccessRate: `${Math.round((originalClaim.stats.refutationSuccessRate || 0) * 100)}%`,
        averageRebuttalQuality: originalClaim.stats.averageRebuttalQuality,
        claimResilienceScore: originalClaim.stats.claimResilienceScore,
        timesRefuted: originalClaim.stats.timesRefuted,
      });
    } else {
      console.log('⚠️  Refutation stats not updated — check Claim model patch (new stats fields missing)');
    }
  } catch (e) {
    fail('TEST 5 — Refutation tracking', e);
  }

  // ── TEST 6: getMostResilient (new query) ──────────────────────
  console.log('\n🧪 TEST 6: getMostResilient() query...');
  try {
    const resilient = await knowledgeGraphService.getMostResilient(null, 5);
    log(`getMostResilient returned ${resilient.length} claims`, resilient.map(c => ({
      text: c.originalText?.substring(0, 60),
      resilienceScore: c.stats?.claimResilienceScore,
      refutationCount: c.stats?.refutationCount,
    })));
  } catch (e) {
    fail('TEST 6 — getMostResilient', e);
  }

  // ── TEST 7: Graph stats ───────────────────────────────────────
  console.log('\n🧪 TEST 7: Graph stats...');
  try {
    const stats = await knowledgeGraphService.getGraphStats();
    log('Graph stats', stats);
  } catch (e) {
    fail('TEST 7 — Graph stats', e);
  }

  // ── CLEANUP ───────────────────────────────────────────────────
  console.log('\n🧹 Cleaning up test claims...');
  try {
    const allTestClaims = [
      ...DISTINCT_CLAIMS,
      ...SIMILAR_PAIRS.flatMap(p => [p.a, p.b]),
      REFUTATION.original,
      REFUTATION.rebuttal,
      'Evidence-based policy making leads to better governance outcomes',
    ];

    for (const text of allTestClaims) {
      const normalized = knowledgeGraphService.normalizeClaim(text);
      await Claim.deleteMany({ normalizedText: normalized });
    }
    console.log('✅ Test claims removed');
  } catch (e) {
    console.log('⚠️  Cleanup failed — manually delete test claims if needed');
  }

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected\n');
}

run().catch(console.error);