/**
 * SMOKE TEST — exercises the AI and reputation stack end to end.
 *
 * Calls services directly, so no running server is required. It makes real LLM
 * and embedding calls and writes a throwaway debate, which it deletes afterwards.
 *
 * Run: node scripts/smokeTest.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Record a check that could not be asserted, rather than passing or failing it.
 *
 * Some checks only mean anything on the smart model. When the daily token budget
 * is spent, grokService silently downgrades to the fast model — availability is
 * preserved and quality drops — and those checks then pass or fail essentially
 * at random. Counting a downgraded run as a pass hides regressions; counting it
 * as a failure cries wolf every time the budget runs out. Neither is honest, so
 * it is reported as skipped and excluded from the pass count.
 */
const skip = (name, reason) => {
  results.push({ name, skipped: true, detail: reason });
  console.log(`⏭️  ${name} — skipped: ${reason}`);
};

await mongoose.connect(process.env.MONGODB_URI);
console.log(`🔌 Connected to "${mongoose.connection.db.databaseName}"\n`);

const User        = (await import('../src/models/user.js')).default;
const Debate      = (await import('../src/models/debate.js')).default;
const DebateTurn  = (await import('../src/models/debateTurn.js')).default;
const Claim       = (await import('../src/models/Claim.js')).default;

const grokService   = (await import('../src/services/grokService.js')).default;
const vectorStore   = (await import('../src/services/vectorStoreService.js')).default;
const embeddings    = (await import('../src/services/embeddingService.js')).default;
const safety        = (await import('../src/services/contentSafetyService.js')).default;
const fallacyGraph  = (await import('../src/services/graph/fallacyGraph.js')).default;
const detector      = (await import('../src/services/refutationDetectionService.js')).default;
const reputation    = (await import('../src/services/argumentReputationService.js')).default;
const aiOpponent    = (await import('../src/services/aiOpponentService.js')).default;
const turnService   = (await import('../src/services/debateTurnService.js')).default;
const { respondAsAIIfNeeded } = await import('../src/services/aiTurnOrchestrator.js');

let debateId = null;

try {
  // ── RAG ───────────────────────────────────────────────────────────────────
  console.log('── RAG ──');
  await vectorStore.initialize();
  const retrieval = await vectorStore.verifyRetrieval();
  check('Vector retrieval returns results', retrieval.ok, retrieval.reason || '');

  const k5 = await vectorStore.retrieveKnowledge('logical fallacy', 5);
  const k2 = await vectorStore.retrieveKnowledge('logical fallacy', 2);
  check('Retriever honours k per call', k5.length === 5 && k2.length === 2, `k=5→${k5.length}, k=2→${k2.length}`);

  await embeddings.embedQuery('cache warm-up');
  const t0 = Date.now();
  await embeddings.embedQuery('cache warm-up');
  const cachedMs = Date.now() - t0;
  check('Embedding cache serves repeats locally', cachedMs < 50, `${cachedMs}ms`);

  // ── Content safety ────────────────────────────────────────────────────────
  console.log('\n── Content safety ──');
  const insult  = await safety.analyse('You are an idiot and your argument is garbage.');
  const civil   = await safety.analyse('I disagree — the evidence does not support that conclusion.');
  const quoting = await safety.analyse('He called me stupid, which was uncalled for.');
  check('Flags a direct insult', insult.isToxic, `score ${insult.score} via ${insult.method}`);
  check('Allows forceful disagreement', !civil.isToxic, `score ${civil.score}`);
  check('Does not flag a quoted slur', !quoting.isToxic, `score ${quoting.score}`);

  // ── Fallacy detection ─────────────────────────────────────────────────────
  console.log('\n── Fallacy detection ──');
  const dilemma = await fallacyGraph.detect(
    `Either we ban social media for teenagers entirely, or we accept that an entire
     generation grows up damaged. There is no middle ground, and anyone who says
     otherwise has not looked at the evidence.`,
    { round: 1, userTier: 'free' },
  );
  const dilemmaRun = { ...fallacyGraph.lastRun };

  const clean = await fallacyGraph.detect(
    `Restricting adolescent social media use may help, though the evidence is mixed.
     A 2023 cohort study found modest improvements in sleep quality when usage was
     capped, but no significant change in reported anxiety.`,
    { round: 1, userTier: 'free' },
  );
  const cleanRun = { ...fallacyGraph.lastRun };

  // fallacyGraph asks for the smart model on purpose: the fast one confidently
  // mislabels sound arguments — citing a study as "appeal to authority", hedging
  // as "slippery slope" — which is exactly the failure this pair exists to catch.
  //
  // grokService downgrades silently once the daily token budget is spent, and on
  // the fast model this pair passes or fails at random (measured 0/6 one day,
  // 3/3 the next). Asserting on a downgraded run would make the suite flaky, so
  // it is skipped and said so. A regex-only run has no model to downgrade and
  // stays asserted.
  const assertable = (run) => !run.llmUsed || run.model === grokService.smartModel;
  const servedBy   = (run) => run.llmUsed ? run.model : 'regex only';

  if (assertable(dilemmaRun)) {
    check('Detects an implicit false dilemma', dilemma.length > 0,
      `${dilemma.length} found via ${servedBy(dilemmaRun)}`);
  } else {
    skip('Detects an implicit false dilemma', `downgraded to ${dilemmaRun.model}`);
  }

  if (assertable(cleanRun)) {
    check('Stays silent on a sound argument', clean.length === 0,
      `${clean.length} false positives via ${servedBy(cleanRun)}`);
  } else {
    skip('Stays silent on a sound argument',
      `downgraded to ${cleanRun.model} (saw ${clean.length} false positive(s))`);
  }

  // ── Scoring rubric ────────────────────────────────────────────────────────
  console.log('\n── Scoring rubric ──');
  const graph = (await import('../src/services/graph/debateTurnGraph.js')).default;

  const scoreOf = async text => {
    const r = await graph.run(text, 'for', [], null, null, 'free');
    const b = r.decisionTrace?.find(t => t.step === 'overall_quality')?.data?.breakdown;
    return { quality: r.overallQuality, ...b };
  };

  const lazy = await scoreOf('I think social media is bad for teenagers. I think it is very bad for them');
  const reasoned = await scoreOf(
    `Social media harms teenagers through sleep displacement. Feeds are optimised to extend session
     length, and adolescents have weaker impulse control, so use runs past intended stopping points.
     Lost sleep degrades mood regulation, so the harm compounds instead of being a one-off cost.`);
  const bluffing = await scoreOf(
    `Research shows social media is harmful. Studies indicate clear negative effects and the data
     indicates that statistics show teenagers are affected. According to research, meta-analysis
     confirms this. The evidence is overwhelming.`);

  check('Reasoned argument outscores bare assertion',
    reasoned.quality > lazy.quality, `${reasoned.quality} vs ${lazy.quality}`);
  check('Bare assertion scores low on substance',
    lazy.substance.score <= 35, `substance ${lazy.substance.score}`);
  check('Evidence vocabulary alone does not earn evidence credit',
    bluffing.evidence.score <= 50, `evidence ${bluffing.evidence.score}`);

  // ── Refutation targeting ──────────────────────────────────────────────────
  console.log('\n── Refutation targeting ──');
  const someClaims = await Claim.find({}).select('originalText embedding stats').limit(4);
  const offTopic = await detector.detectTargets({
    rebuttalText: 'I like pizza and my favourite colour is blue.',
    opposingClaims: someClaims,
  });
  check('Ignores off-topic text', offTopic.length === 0, `${offTopic.length} false targets`);

  // ── Argument reputation ───────────────────────────────────────────────────
  console.log('\n── Argument reputation ──');
  const unattributed = await Claim.countDocuments({ $or: [{ author: null }, { author: { $exists: false } }] });
  check('All claims are attributed', unattributed === 0, `${unattributed} unattributed`);

  const human = await User.findOne({ isActive: true, username: { $ne: 'veil_ai' } }).select('_id username');
  const profile = await reputation.getFullProfile(human._id);
  check('Reputation profile builds', typeof profile.resilienceScore === 'number',
    `${human.username}: ${profile.totalClaims} claims, ${profile.contestedClaims} contested, tier ${profile.tier}`);

  // ── AI opponent, full loop ────────────────────────────────────────────────
  console.log('\n── AI opponent (live debate) ──');
  const debate = await aiOpponent.createDebateVsAI({
    topic: 'Smoke test: nuclear power is essential to decarbonisation',
    userId: human._id,
    userSide: 'for',
    difficulty: 'balanced',
  });
  debateId = debate._id;
  check('Practice debate starts active', debate.status === 'active',
    debate.participants.map(p => `${p.user.username}[${p.side}]`).join(' vs '));

  await turnService.submitDebateTurn(debate._id, human._id,
    `Nuclear power is essential to decarbonisation. It supplies constant baseload output
     that wind and solar cannot yet guarantee, and its lifecycle emissions per kilowatt-hour
     are comparable to wind. Excluding it makes the timeline substantially harder to meet.`);

  // Both models can be rate-limited at once — the smart model on tokens-per-day
  // and the fast fallback on tokens-per-minute — and then the opponent cannot
  // reply for reasons that have nothing to do with this code. Distinguish that
  // from a genuine failure to produce a turn, on the same principle as the
  // fallacy checks above: report what could not be asserted rather than
  // colouring the run red for an upstream quota.
  let opponentBlocked = null;
  try {
    await respondAsAIIfNeeded(debate._id);
  } catch (err) {
    if (/rate limit|TPD|TPM|per day|per minute/i.test(err.message)) opponentBlocked = err.message;
    else throw err;
  }

  const turns = await DebateTurn.find({ debate: debate._id });
  const aiTurn = turns.find(t => t.side === 'against');

  // A missing turn with the models exhausted is unproven, not proven broken.
  if (!opponentBlocked && turns.length < 2 && !grokService.smartWasAvailable()) {
    opponentBlocked = `models rate-limited (last smart request served by ${grokService.smartServedBy()})`;
  }

  if (opponentBlocked) {
    skip('AI produced a counter-argument', opponentBlocked.slice(0, 120));
    skip('AI turn was analysed like a human turn', 'no AI turn to analyse');
  } else {
    check('AI produced a counter-argument', turns.length === 2, `${turns.length} turns`);
    check('AI turn was analysed like a human turn',
      typeof aiTurn?.aiAnalysis?.overallQuality === 'number',
      `quality ${aiTurn?.aiAnalysis?.overallQuality}/100`);
  }

  const debateClaims = await Claim.find({ 'debates.debate': debate._id });
  check('Claims entered the graph with authors',
    debateClaims.length > 0 && debateClaims.every(c => c.author),
    `${debateClaims.length} claims`);

} catch (error) {
  check('Smoke test completed without throwing', false, error.message);
  console.error(error);
} finally {
  if (debateId) {
    await DebateTurn.deleteMany({ debate: debateId });
    await Debate.deleteOne({ _id: debateId });
    console.log('\n🧹 Removed the throwaway debate (claims stay in the graph)');
  }
}

const skipped  = results.filter(r => r.skipped);
const asserted = results.filter(r => !r.skipped);
const failed   = asserted.filter(r => !r.passed);

console.log(`\n${'─'.repeat(50)}`);
console.log(`${asserted.length - failed.length}/${asserted.length} checks passed`
  + (skipped.length ? `, ${skipped.length} skipped` : ''));

if (skipped.length) {
  console.log('\nSkipped (not asserted — do not read as passing):');
  skipped.forEach(s => console.log(`  ⏭️  ${s.name} — ${s.detail}`));
}
if (failed.length) {
  console.log('\nFailed:');
  failed.forEach(f => console.log(`  ❌ ${f.name} — ${f.detail}`));
}

await mongoose.disconnect();
process.exit(failed.length ? 1 : 0);
