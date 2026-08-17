/**
 * Regression tests for the debate scoring pipeline.
 *
 * Every case here corresponds to a defect that produced no error at runtime.
 * That is what made them survive: Mongoose drops writes to undeclared paths
 * silently, and reading a field that does not exist yields `undefined` rather
 * than throwing, so a scoring run that recorded nothing looked exactly like one
 * that worked.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import Debate from '../src/models/debate.js';
import DebateTurn from '../src/models/debateTurn.js';
import DebateVote from '../src/models/debateVote.js';
import UserPerformance from '../src/models/UserPerformance.js';
import User from '../src/models/user.js';
import debateScoringService from '../src/services/debateScoringService.js';

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map(c => c.deleteMany({})));
});

const makeUser = (username) =>
  User.create({ username, email: `${username}@test.local`, password: 'password123' });

const makeTurn = (debateId, authorId, side, overrides = {}) =>
  DebateTurn.create({
    debate: debateId,
    author: authorId,
    side,
    round: overrides.round ?? 1,
    turnNumber: overrides.turnNumber ?? 1,
    content: overrides.content ?? 'A sufficiently long argument for the schema minimum.',
    wordCount: 9,
    aiAnalysis: overrides.aiAnalysis ?? {},
  });

describe('vote aggregation', () => {
  /**
   * Both statics built their $match with `mongoose.Types.ObjectId(id)`. Since
   * Mongoose 6 that is a class, and calling a class without `new` throws — so
   * every one of these endpoints answered 500, and so did the debate stats
   * endpoint that depends on them.
   */
  test('round votes aggregate instead of throwing on ObjectId construction', async () => {
    const debateId = new mongoose.Types.ObjectId();
    const [a, b] = await Promise.all([makeUser('voter_a'), makeUser('voter_b')]);

    await DebateVote.create([
      { debate: debateId, round: 1, user: a._id, vote: 'for', confidence: 4 },
      { debate: debateId, round: 1, user: b._id, vote: 'against', confidence: 2 },
    ]);

    const rows = await DebateVote.getRoundVotes(debateId.toString(), 1);

    expect(rows).toHaveLength(2);
    expect(rows.find(r => r._id === 'for').count).toBe(1);
  });

  test('debate votes accept a string id, which is what the route supplies', async () => {
    const debateId = new mongoose.Types.ObjectId();
    const user = await makeUser('voter_c');

    await DebateVote.create({ debate: debateId, round: 2, user: user._id, vote: 'for' });

    const rows = await DebateVote.getDebateVotes(debateId.toString());
    expect(rows[0]._id).toBe(2);
    expect(rows[0].totalVotes).toBe(1);
  });
});

describe('turn statistics', () => {
  /**
   * debateService.getDebateStats has always called DebateTurn.getTurnStats. The
   * static was never defined, so `/api/debates/:id/stats` threw
   * "getTurnStats is not a function" for every debate ever created.
   */
  test('getTurnStats exists and summarises both sides', async () => {
    expect(typeof DebateTurn.getTurnStats).toBe('function');

    const debateId = new mongoose.Types.ObjectId();
    const author = await makeUser('stats_author');

    await makeTurn(debateId, author._id, 'for', {
      turnNumber: 1,
      aiAnalysis: { overallQuality: 80, toneScore: 70, claims: ['a', 'b'], fallacies: [] },
    });
    await makeTurn(debateId, author._id, 'against', {
      turnNumber: 2,
      aiAnalysis: { overallQuality: 60, toneScore: 50, claims: ['c'], fallacies: [] },
    });

    const stats = await DebateTurn.getTurnStats(debateId);

    expect(stats.totalTurns).toBe(2);
    expect(stats.for.avgQuality).toBe(80);
    expect(stats.for.totalClaims).toBe(2);
    expect(stats.against.avgQuality).toBe(60);
  });
});

describe('user performance after a debate', () => {
  /**
   * The single most consequential defect in the codebase: participants were read
   * as `debate.participants.for.user`, but `participants` is an array. Both ids
   * came back undefined, so no debate had ever updated a performance record —
   * leaving the coach dashboard, every leaderboard, the achievement graph and
   * the debate share of karma reading a permanently empty collection.
   */
  test('both participants are found in the participants array', async () => {
    const [winner, loser] = await Promise.all([makeUser('side_for'), makeUser('side_against')]);

    const debate = await Debate.create({
      topic: 'Whether this records anything at all',
      initiator: winner._id,
      participants: [
        { user: winner._id, side: 'for' },
        { user: loser._id, side: 'against' },
      ],
      rounds: Debate.getDefaultRounds(),
    });

    await debateScoringService.updateUserPerformances(
      debate,
      'for',
      { argumentQuality: 82, conductClarity: 70 },
      { argumentQuality: 51, conductClarity: 65 },
      { for: [], against: [] },
    );

    const [forPerf, againstPerf] = await Promise.all([
      UserPerformance.findOne({ user: winner._id }),
      UserPerformance.findOne({ user: loser._id }),
    ]);

    expect(forPerf).not.toBeNull();
    expect(againstPerf).not.toBeNull();
    expect(forPerf.stats.wins).toBe(1);
    expect(againstPerf.stats.losses).toBe(1);
  });

  /**
   * The write targeted `debatesParticipated`, `wins`, `averageArgumentQuality`
   * and friends — none of which the schema declares. Strict mode discarded them
   * all, so `.save()` succeeded and stored nothing.
   */
  test('statistics land on the paths the schema actually declares', async () => {
    const user = await makeUser('paths_user');
    const debateId = new mongoose.Types.ObjectId();

    const turns = [
      await makeTurn(debateId, user._id, 'for', {
        turnNumber: 1,
        aiAnalysis: {
          overallQuality: 70, toneScore: 80, clarityScore: 60,
          evidenceAnalysis: { score: 40 },
          fallacies: [{ type: 'straw_man', explanation: 'x', severity: 5 }],
        },
      }),
    ];

    await debateScoringService.updatePerformance(
      user._id, 'win', { argumentQuality: 70, conductClarity: 70 }, turns,
    );

    const perf = await UserPerformance.findOne({ user: user._id }).lean();

    expect(perf.stats.totalDebates).toBe(1);
    expect(perf.stats.winRate).toBe(100);
    expect(perf.stats.totalTurns).toBe(1);
    expect(perf.qualityMetrics.avgToneScore).toBe(80);
    expect(perf.qualityMetrics.avgEvidenceScore).toBe(40);
    expect(perf.fallacyStats.totalFallacies).toBe(1);
    expect(perf.fallacyStats.commonFallacies[0].type).toBe('straw_man');

    // Nothing should be written under the old, undeclared names.
    expect(perf.debatesParticipated).toBeUndefined();
    expect(perf.averageArgumentQuality).toBeUndefined();
  });

  test('a second debate blends rather than replaces the running averages', async () => {
    const user = await makeUser('blend_user');
    const debateId = new mongoose.Types.ObjectId();

    const turnWith = tone => [
      new DebateTurn({
        debate: debateId, author: user._id, side: 'for', round: 1, turnNumber: 1,
        content: 'Long enough content to satisfy the schema.', wordCount: 7,
        aiAnalysis: { toneScore: tone, overallQuality: tone },
      }),
    ];

    await debateScoringService.updatePerformance(user._id, 'win',  { argumentQuality: 60 }, turnWith(60));
    await debateScoringService.updatePerformance(user._id, 'loss', { argumentQuality: 80 }, turnWith(80));

    const perf = await UserPerformance.findOne({ user: user._id }).lean();

    expect(perf.stats.totalDebates).toBe(2);
    expect(perf.stats.winRate).toBe(50);
    expect(perf.qualityMetrics.avgToneScore).toBe(70);
  });
});

describe('rebuttal effectiveness', () => {
  /**
   * `aiAnalysis.rebuttals` is a list of strings. This was read as `turn.rebuttals`
   * — not a field — and each entry treated as an object with a numeric
   * `.effectiveness`. The array was therefore always empty and every side scored
   * a flat 40 on a dimension worth 30% of the verdict, for every debate.
   */
  test('engaging the opponent scores above ignoring them', () => {
    const engaged = debateScoringService.calculateRebuttalEffectiveness([
      { round: 2, aiAnalysis: { overallQuality: 70, rebuttals: ['their cost claim', 'their timeline'] } },
    ]);

    const ignored = debateScoringService.calculateRebuttalEffectiveness([
      { round: 2, aiAnalysis: { overallQuality: 70, rebuttals: [] } },
    ]);

    expect(engaged).toBeGreaterThan(ignored);
    expect(engaged).toBe(80);
  });

  test('an opening turn is not penalised for having nothing to rebut', () => {
    const opening = debateScoringService.calculateRebuttalEffectiveness([
      { round: 1, aiAnalysis: { overallQuality: 70, rebuttals: [] } },
    ]);
    const laterSilence = debateScoringService.calculateRebuttalEffectiveness([
      { round: 3, aiAnalysis: { overallQuality: 70, rebuttals: [] } },
    ]);

    expect(opening).toBeGreaterThan(laterSilence);
  });
});

describe('argument quality inputs', () => {
  /**
   * Claims were read from `turn.claims` and evidence from
   * `aiAnalysis.evidenceScore`; the real paths are `aiAnalysis.claims` and
   * `aiAnalysis.evidenceAnalysis.score` / `evidenceQuality`. Both bonuses were
   * therefore dead code.
   */
  test('claims advanced raise the score', () => {
    const withClaims = debateScoringService.calculateArgumentQuality([
      { aiAnalysis: { overallQuality: 50, claims: ['one', 'two', 'three'] } },
    ]);
    const withoutClaims = debateScoringService.calculateArgumentQuality([
      { aiAnalysis: { overallQuality: 50, claims: [] } },
    ]);

    expect(withClaims).toBeGreaterThan(withoutClaims);
  });

  test('evidence is read from either shape the analysers produce', () => {
    const viaAnalysis = debateScoringService.calculateArgumentQuality([
      { aiAnalysis: { overallQuality: 50, evidenceAnalysis: { score: 90 } } },
    ]);
    const viaQuality = debateScoringService.calculateArgumentQuality([
      { aiAnalysis: { overallQuality: 50, evidenceQuality: 90 } },
    ]);

    expect(viaAnalysis).toBe(viaQuality);
    expect(viaAnalysis).toBeGreaterThan(50);
  });
});

describe('reading a stored score', () => {
  /**
   * `getDebateScore` returned a Mongoose document while the controller checked
   * `result.success` — a property documents do not have — so the guard was
   * always true and `GET /api/debates/:id/score` answered 404 for every debate,
   * including ones whose score was already stored. The duplicate route
   * registered above it in debateRoutes.js meant this handler never ran, which
   * is why the contract mismatch went unnoticed.
   */
  test('an unfinished debate is refused without triggering a scoring run', async () => {
    const user = await makeUser('unfinished');
    const debate = await Debate.create({
      topic: 'Still in progress',
      initiator: user._id,
      status: 'active',
      participants: [{ user: user._id, side: 'for' }],
      rounds: Debate.getDefaultRounds(),
    });

    const result = await debateScoringService.getDebateScore(debate._id);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not finished/i);
    // Crucially, no performance record was created as a side effect.
    expect(await UserPerformance.countDocuments({})).toBe(0);
  });

  test('a missing debate is reported rather than crashing', async () => {
    const result = await debateScoringService.getDebateScore(new mongoose.Types.ObjectId());
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });
});

describe('rank', () => {
  /**
   * Two disagreeing definitions existed: a win-rate-only virtual and a composite
   * `updateRankTier` whose assignments to that getter-only virtual were silently
   * discarded. A user's tier depended on which one rendered them.
   */
  test('quality carries the tier, not win rate alone', () => {
    const careful = new UserPerformance({
      user: new mongoose.Types.ObjectId(),
      stats: { totalDebates: 20, winRate: 45 },
      qualityMetrics: { avgOverallQuality: 90 },
      fallacyStats: { fallacyRate: 0 },
    });

    const lucky = new UserPerformance({
      user: new mongoose.Types.ObjectId(),
      stats: { totalDebates: 20, winRate: 80 },
      qualityMetrics: { avgOverallQuality: 20 },
      fallacyStats: { fallacyRate: 0.8 },
    });

    expect(careful.rank).toBe('Expert');
    expect(lucky.rank).toBe('Beginner');
  });

  test('updateRankTier agrees with the virtual instead of contradicting it', () => {
    const perf = new UserPerformance({
      user: new mongoose.Types.ObjectId(),
      stats: { totalDebates: 2, winRate: 100 },
    });

    expect(perf.updateRankTier()).toBe(perf.rank);
    expect(perf.rank).toBe('Novice');
  });

  test('rank survives serialisation, so clients can render it', () => {
    const perf = new UserPerformance({
      user: new mongoose.Types.ObjectId(),
      stats: { totalDebates: 10, winRate: 60 },
      qualityMetrics: { avgOverallQuality: 70 },
      fallacyStats: { fallacyRate: 0.1 },
    });

    expect(JSON.parse(JSON.stringify(perf)).rank).toBe(perf.rank);
  });
});
