import mongoose from 'mongoose';
import Claim from '../models/Claim.js';
import User from '../models/user.js';

/**
 * ARGUMENT REPUTATION
 *
 * The product's core promise: an argument you make is not disposable. Every
 * claim you advance is stored, can be challenged in any later debate, and
 * carries a resilience score reflecting how it held up.
 *
 * This service turns the claim graph into a per-user record — what you have
 * argued, what survived scrutiny, and what did not. It reads only; the scores
 * themselves are maintained by knowledgeGraphService as debates happen.
 */

// A claim needs to have actually been contested before "survived" means anything.
const CONTESTED_MIN_REFUTATIONS = 1;
// A claim challenged once and never successfully refuted scores 58 under the
// confidence-weighted formula, so a 65 threshold made "survived" unreachable
// until a third challenge — reporting 0% survival for claims that had in fact
// held every time.
const STRONG_CLAIM_SCORE = 55;
const WEAK_CLAIM_SCORE   = 40;

// Scored tiers only. "Untested" is a separate state, not the bottom of this
// scale — it previously sat here at min:0 and swallowed every score below 40, so
// a user whose claims were consistently demolished was labelled "Untested",
// which is the opposite of what had happened to them.
const TIERS = [
  { min: 85, tier: 'Ironclad',  blurb: 'Your claims survive sustained challenge.' },
  { min: 70, tier: 'Solid',     blurb: 'Most of your claims hold up under pressure.' },
  { min: 55, tier: 'Contested', blurb: 'Your claims are challenged about as often as they hold.' },
  { min: 40, tier: 'Brittle',   blurb: 'Your claims are frequently refuted — tighten your evidence.' },
  { min: 0,  tier: 'Fragile',   blurb: 'Your claims rarely survive a challenge.' },
];

const UNTESTED = { tier: 'Untested', blurb: 'Not enough contested claims to judge yet.' };

const tierFor = (score, contestedCount) => {
  if (contestedCount === 0) return UNTESTED;
  return TIERS.find(t => score >= t.min) ?? TIERS[TIERS.length - 1];
};

class ArgumentReputationService {
  /**
   * Aggregated record for one user. Counts every claim they authored, weighting
   * the headline score by contested claims only — a claim nobody ever challenged
   * says nothing about how well it would hold.
   */
  async getReputation(userId) {
    const [summary] = await Claim.aggregate([
      { $match: { author: new mongoose.Types.ObjectId(userId.toString()) } },
      {
        $group: {
          _id: null,
          totalClaims:      { $sum: 1 },
          totalUses:        { $sum: '$stats.totalUses' },
          contestedClaims:  { $sum: { $cond: [{ $gte: ['$stats.refutationCount', CONTESTED_MIN_REFUTATIONS] }, 1, 0] } },
          survivedClaims:   {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$stats.refutationCount', CONTESTED_MIN_REFUTATIONS] },
                    { $gte: ['$stats.claimResilienceScore', STRONG_CLAIM_SCORE] },
                  ],
                },
                1, 0,
              ],
            },
          },
          brokenClaims: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$stats.refutationCount', CONTESTED_MIN_REFUTATIONS] },
                    { $lt: ['$stats.claimResilienceScore', WEAK_CLAIM_SCORE] },
                  ],
                },
                1, 0,
              ],
            },
          },
          totalRefutations:   { $sum: '$stats.refutationCount' },
          contestedResilience: {
            $push: {
              $cond: [
                { $gte: ['$stats.refutationCount', CONTESTED_MIN_REFUTATIONS] },
                '$stats.claimResilienceScore',
                '$$REMOVE',
              ],
            },
          },
        },
      },
    ]);

    const contested = summary?.contestedResilience ?? [];
    const resilienceScore = contested.length
      ? Math.round(contested.reduce((sum, v) => sum + v, 0) / contested.length)
      : 0;

    const { tier, blurb } = tierFor(resilienceScore, contested.length);

    return {
      userId: userId.toString(),
      totalClaims:      summary?.totalClaims ?? 0,
      totalUses:        summary?.totalUses ?? 0,
      contestedClaims:  summary?.contestedClaims ?? 0,
      survivedClaims:   summary?.survivedClaims ?? 0,
      brokenClaims:     summary?.brokenClaims ?? 0,
      totalRefutations: summary?.totalRefutations ?? 0,
      resilienceScore,
      tier,
      tierBlurb: blurb,
      survivalRate: (summary?.contestedClaims ?? 0) > 0
        ? Math.round(((summary.survivedClaims ?? 0) / summary.contestedClaims) * 100)
        : null,
    };
  }

  /** The claims that best and worst represent this user's record. */
  async getNotableClaims(userId, limit = 5) {
    const authored = { author: new mongoose.Types.ObjectId(userId.toString()) };

    const [strongest, weakest, mostUsed] = await Promise.all([
      Claim.find({ ...authored, 'stats.refutationCount': { $gte: CONTESTED_MIN_REFUTATIONS } })
        .sort({ 'stats.claimResilienceScore': -1, 'stats.refutationCount': -1 })
        .limit(limit)
        .select('originalText topic stats.claimResilienceScore stats.refutationCount stats.totalUses createdAt')
        .lean(),

      Claim.find({ ...authored, 'stats.refutationCount': { $gte: CONTESTED_MIN_REFUTATIONS } })
        .sort({ 'stats.claimResilienceScore': 1, 'stats.refutationCount': -1 })
        .limit(limit)
        .select('originalText topic stats.claimResilienceScore stats.refutationCount stats.totalUses createdAt')
        .lean(),

      Claim.find(authored)
        .sort({ 'stats.totalUses': -1 })
        .limit(limit)
        .select('originalText topic stats.totalUses stats.claimResilienceScore createdAt')
        .lean(),
    ]);

    return { strongest, weakest, mostUsed };
  }

  /** Which subjects this user actually argues about, and how well. */
  async getTopicBreakdown(userId, limit = 8) {
    return Claim.aggregate([
      { $match: { author: new mongoose.Types.ObjectId(userId.toString()) } },
      {
        $group: {
          _id: '$topic',
          claims:          { $sum: 1 },
          avgResilience:   { $avg: '$stats.claimResilienceScore' },
          refutations:     { $sum: '$stats.refutationCount' },
        },
      },
      { $sort: { claims: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          topic: { $ifNull: ['$_id', 'general'] },
          claims: 1,
          refutations: 1,
          avgResilience: { $round: ['$avgResilience', 0] },
        },
      },
    ]);
  }

  async getFullProfile(userId) {
    const [reputation, notable, topics] = await Promise.all([
      this.getReputation(userId),
      this.getNotableClaims(userId),
      this.getTopicBreakdown(userId),
    ]);

    return { ...reputation, notable, topics };
  }

  /**
   * Ranks users by how well their contested claims held up, not by volume —
   * making 500 unchallenged claims should not outrank surviving 10 hard ones.
   */
  async getLeaderboard(limit = 20) {
    const rows = await Claim.aggregate([
      { $match: { author: { $ne: null }, 'stats.refutationCount': { $gte: CONTESTED_MIN_REFUTATIONS } } },
      {
        $group: {
          _id: '$author',
          contestedClaims: { $sum: 1 },
          avgResilience:   { $avg: '$stats.claimResilienceScore' },
          survived: {
            $sum: { $cond: [{ $gte: ['$stats.claimResilienceScore', STRONG_CLAIM_SCORE] }, 1, 0] },
          },
        },
      },
      { $match: { contestedClaims: { $gte: 3 } } },
      { $sort: { avgResilience: -1, contestedClaims: -1 } },
      { $limit: limit },
    ]);

    const users = await User.find({ _id: { $in: rows.map(r => r._id) }, isSystem: { $ne: true } })
      .select('username')
      .lean();

    const nameById = new Map(users.map(u => [u._id.toString(), u.username]));

    // Rows without a name belong to system accounts (the AI opponent) or to
    // deleted users, and are dropped rather than shown as "unknown". Ranks are
    // assigned after filtering so the list has no gaps.
    return rows
      .filter(row => nameById.has(row._id.toString()))
      .map((row, index) => ({
        rank: index + 1,
        userId: row._id,
        username: nameById.get(row._id.toString()),
        contestedClaims: row.contestedClaims,
        survived: row.survived,
        resilienceScore: Math.round(row.avgResilience),
      }));
  }
}

export default new ArgumentReputationService();
