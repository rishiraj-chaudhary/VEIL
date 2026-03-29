/**
 * COMMUNITY HEALTH ENGINE — Phase 9
 *
 * Builds on top of CommunityMemoryGraph data + live post/comment signals.
 *
 * Computes:
 *   - polarizationScore      — from memoryAnalysis (already computed)
 *   - toxicityTrend          — rising / stable / falling
 *   - participationImbalance — are a few users dominating?
 *   - escalationRate         — % of threads that escalate
 *   - healthScore            — 0–100 composite
 *   - riskLevel              — healthy / watch / concern / critical
 *   - interventionSuggestion — soft nudge text for moderators
 *
 * Nodes:
 *   1. loadSignals
 *   2. computeToxicityTrend
 *   3. computeParticipationImbalance
 *   4. computeEscalationRate
 *   5. computeHealthScore
 *   6. generateIntervention + persist
 *
 * Place at: backend/src/services/graph/communityHealthGraph.js
 */

import Comment from '../../models/comment.js';
import Community from '../../models/community.js';
import Post from '../../models/post.js';
import grokService from '../grokService.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const REANALYSE_THRESHOLD = 10; // re-run after this many new posts
const MAX_POSTS           = 50;
const MAX_COMMENTS        = 100;

// Toxic language signals (heuristic layer)
const TOXIC_PATTERNS = [
  /\b(idiot|moron|stupid|dumb|shut up|you('re| are) wrong|garbage|trash|pathetic|loser)\b/gi,
  /\b(hate|disgusting|disgrace|embarrassing|delusional|brainwashed)\b/gi,
];

// ─── Graph ────────────────────────────────────────────────────────────────────

class CommunityHealthGraph {

  // ── Node 1: Load signals ──────────────────────────────────────────────────────
  async _node_loadSignals(state) {
    const { communityId, options } = state;

    const community = await Community.findById(communityId)
      .select('name displayName memberCount postCount memoryAnalysis healthAnalysis')
      .lean();

    if (!community) throw new Error(`Community ${communityId} not found`);

    // Cache check
    const existing = community.healthAnalysis;
    if (!options.force && existing?.analysedAt) {
      const postsSince = community.postCount - (existing.postCountAtAnalysis || 0);
      if (postsSince < REANALYSE_THRESHOLD) {
        state.skipAnalysis = true;
        state.cachedResult = existing;
        console.log(`🏥 [Health:1] Using cached health analysis (${postsSince} new posts)`);
        return;
      }
    }

    // Load recent posts
    const posts = await Post.find({ community: communityId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(MAX_POSTS)
      .populate('author', 'username')
      .lean();

    if (posts.length === 0) {
      state.skipAnalysis = true;
      state.cachedResult = this._emptyHealth();
      console.log('🏥 [Health:1] No posts, skipping');
      return;
    }

    // Load recent comments
    const postIds  = posts.map(p => p._id);
    const comments = await Comment.find({ post: { $in: postIds }, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(MAX_COMMENTS)
      .populate('author', 'username')
      .lean();

    // Split posts into two halves for trend comparison
    const midpoint   = Math.floor(posts.length / 2);
    state.recentPosts  = posts.slice(0, midpoint);       // newer half
    state.olderPosts   = posts.slice(midpoint);           // older half
    state.recentComments = comments.slice(0, Math.floor(comments.length / 2));
    state.olderComments  = comments.slice(Math.floor(comments.length / 2));

    state.community      = community;
    state.allPosts       = posts;
    state.allComments    = comments;
    state.skipAnalysis   = false;

    // Carry polarization from memoryAnalysis if available
    state.polarizationScore = community.memoryAnalysis?.polarizationScore ?? 50;

    console.log(`🏥 [Health:1] Loaded ${posts.length} posts, ${comments.length} comments`);
  }

  // ── Node 2: Compute toxicity trend ───────────────────────────────────────────
  async _node_computeToxicityTrend(state) {
    if (state.skipAnalysis) return;

    const toxicityRate = (comments) => {
      if (!comments.length) return 0;
      const toxicCount = comments.filter(c =>
        TOXIC_PATTERNS.some(p => p.test(c.content))
      ).length;
      return toxicCount / comments.length;
    };

    const recentRate = toxicityRate(state.recentComments);
    const olderRate  = toxicityRate(state.olderComments);

    const delta = recentRate - olderRate;
    state.toxicityRateRecent = recentRate;
    state.toxicityRateOlder  = olderRate;
    state.toxicityTrend      = delta > 0.05 ? 'rising' : delta < -0.05 ? 'falling' : 'stable';

    console.log(`🏥 [Health:2] Toxicity trend: ${state.toxicityTrend} (recent: ${(recentRate * 100).toFixed(1)}%, older: ${(olderRate * 100).toFixed(1)}%)`);
  }

  // ── Node 3: Compute participation imbalance ───────────────────────────────────
  async _node_computeParticipationImbalance(state) {
    if (state.skipAnalysis) return;

    // Count posts + comments per author
    const authorActivity = {};

    for (const p of state.allPosts) {
      const id = p.author?._id?.toString() || p.author?.toString();
      if (id) authorActivity[id] = (authorActivity[id] || 0) + 1;
    }
    for (const c of state.allComments) {
      const id = c.author?._id?.toString() || c.author?.toString();
      if (id) authorActivity[id] = (authorActivity[id] || 0) + 1;
    }

    const counts = Object.values(authorActivity).sort((a, b) => b - a);
    const total  = counts.reduce((s, v) => s + v, 0) || 1;
    const unique = counts.length;

    // Gini-like imbalance: what % of activity comes from top 20% of users
    const top20count  = Math.max(1, Math.ceil(unique * 0.2));
    const top20activity = counts.slice(0, top20count).reduce((s, v) => s + v, 0);
    const imbalanceRatio = top20activity / total;

    // 0 = perfectly balanced, 100 = one person does everything
    state.participationImbalance = Math.round(imbalanceRatio * 100);
    state.uniqueContributors     = unique;
    state.dominantUserShare      = counts[0] ? Math.round((counts[0] / total) * 100) : 0;

    console.log(`🏥 [Health:3] Participation imbalance: ${state.participationImbalance}% (${unique} unique contributors, top user: ${state.dominantUserShare}%)`);
  }

  // ── Node 4: Compute escalation rate ──────────────────────────────────────────
  async _node_computeEscalationRate(state) {
    if (state.skipAnalysis) return;

    // Use threadAnalysis.healthLabel if available on posts, otherwise heuristic
    let escalatedCount = 0;
    let analysedCount  = 0;

    for (const post of state.allPosts) {
      if (post.threadAnalysis?.healthLabel) {
        analysedCount++;
        if (['troubled', 'toxic'].includes(post.threadAnalysis.healthLabel)) {
          escalatedCount++;
        }
      }
    }

    if (analysedCount > 0) {
      state.escalationRate = Math.round((escalatedCount / analysedCount) * 100);
    } else {
      // Heuristic: count threads where comments contain toxic patterns
      const commentsByPost = {};
      for (const c of state.allComments) {
        const pid = c.post?.toString();
        if (pid) {
          if (!commentsByPost[pid]) commentsByPost[pid] = [];
          commentsByPost[pid].push(c);
        }
      }

      let escalatedThreads = 0;
      const threadIds = Object.keys(commentsByPost);
      for (const pid of threadIds) {
        const threadComments = commentsByPost[pid];
        const toxicInThread  = threadComments.filter(c =>
          TOXIC_PATTERNS.some(p => p.test(c.content))
        ).length;
        if (toxicInThread / threadComments.length > 0.15) escalatedThreads++;
      }

      state.escalationRate = threadIds.length > 0
        ? Math.round((escalatedThreads / threadIds.length) * 100)
        : 0;
    }

    console.log(`🏥 [Health:4] Escalation rate: ${state.escalationRate}%`);
  }

  // ── Node 5: Compute health score ─────────────────────────────────────────────
  async _node_computeHealthScore(state) {
    if (state.skipAnalysis) return;

    // Component scores (all 0–100, higher = healthier)
    const polarizationHealth    = 100 - (state.polarizationScore ?? 50);
    const toxicityHealth        = 100 - Math.min(100, state.toxicityRateRecent * 500);
    const toxicityTrendBonus    = state.toxicityTrend === 'falling' ? 10
                                : state.toxicityTrend === 'rising'  ? -10 : 0;
    const participationHealth   = 100 - state.participationImbalance;
    const escalationHealth      = 100 - state.escalationRate;

    // Weighted formula
    const healthScore = Math.round(
      polarizationHealth  * 0.25 +
      toxicityHealth      * 0.30 +
      participationHealth * 0.20 +
      escalationHealth    * 0.25 +
      toxicityTrendBonus
    );

    state.healthScore = Math.max(0, Math.min(100, healthScore));

    // Risk level
    state.riskLevel =
      state.healthScore >= 75 ? 'healthy' :
      state.healthScore >= 50 ? 'watch'   :
      state.healthScore >= 25 ? 'concern' : 'critical';

    console.log(`🏥 [Health:5] Health score: ${state.healthScore} (${state.riskLevel})`);
    console.log(`   Components — polarization: ${polarizationHealth.toFixed(0)}, toxicity: ${toxicityHealth.toFixed(0)}, participation: ${participationHealth}, escalation: ${escalationHealth}`);
  }

  // ── Node 6: Generate intervention + persist ───────────────────────────────────
  async _node_generateInterventionAndPersist(state) {
    if (state.skipAnalysis) return;

    // Only generate LLM suggestion for watch/concern/critical
    let interventionSuggestion = null;

    if (state.riskLevel !== 'healthy') {
      const issues = [];
      if (state.toxicityTrend === 'rising')       issues.push('toxicity is increasing');
      if (state.polarizationScore > 65)            issues.push('community is highly polarized');
      if (state.participationImbalance > 70)       issues.push('a few users dominate the conversation');
      if (state.escalationRate > 30)               issues.push(`${state.escalationRate}% of threads escalate`);

      if (issues.length > 0) {
        const prompt = `You are a community moderator assistant. Write a single, constructive, non-accusatory suggestion for improving community health.

COMMUNITY: "${state.community.displayName}"
HEALTH SCORE: ${state.healthScore}/100 (${state.riskLevel})
ISSUES DETECTED: ${issues.join(', ')}

Write 1–2 sentences. Be specific, actionable, and encouraging. Do not mention scores or numbers.
Do not use bullet points. Plain text only.`;

        try {
          const suggestion = await grokService.generateFast(prompt, {
            systemRole: 'You are a helpful community moderator. Be constructive and brief.',
          });
          interventionSuggestion = suggestion.trim().slice(0, 400);
        } catch {
          interventionSuggestion = this._fallbackIntervention(state.riskLevel, issues);
        }
      }
    }

    state.interventionSuggestion = interventionSuggestion;

    // Build result
    const analysis = {
      healthScore:              state.healthScore,
      riskLevel:                state.riskLevel,
      polarizationScore:        state.polarizationScore,
      toxicityTrend:            state.toxicityTrend,
      toxicityRate:             Math.round(state.toxicityRateRecent * 100),
      participationImbalance:   state.participationImbalance,
      uniqueContributors:       state.uniqueContributors,
      dominantUserShare:        state.dominantUserShare,
      escalationRate:           state.escalationRate,
      interventionSuggestion,
      postCountAtAnalysis:      state.allPosts.length,
      analysedAt:               new Date(),
    };

    await Community.findByIdAndUpdate(state.communityId, {
      healthAnalysis: analysis,
    });

    state.result = analysis;
    console.log(`🏥 [Health:6] Persisted health analysis for ${state.communityId}`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  _fallbackIntervention(riskLevel, issues) {
    if (issues.includes('toxicity is increasing'))
      return 'Consider pinning community guidelines to remind members of respectful discourse standards.';
    if (issues.includes('a few users dominate the conversation'))
      return 'Try encouraging quieter members to share their perspectives with open-ended questions.';
    if (riskLevel === 'critical')
      return 'This community may benefit from a moderator check-in and a reminder of community values.';
    return 'Encouraging more diverse participation and civil discussion will help this community thrive.';
  }

  _emptyHealth() {
    return {
      healthScore:            null,
      riskLevel:              null,
      polarizationScore:      null,
      toxicityTrend:          null,
      toxicityRate:           null,
      participationImbalance: null,
      uniqueContributors:     null,
      dominantUserShare:      null,
      escalationRate:         null,
      interventionSuggestion: null,
      postCountAtAnalysis:    0,
      analysedAt:             new Date(),
    };
  }

  // ─── Public run ───────────────────────────────────────────────────────────────
  /**
   * @param {string|ObjectId} communityId
   * @param {Object} options
   * @param {boolean} options.force — bypass cache
   */
  async run(communityId, options = {}) {
    const state = {
      communityId:   communityId.toString(),
      options,
      community:     null,
      allPosts:      [],
      allComments:   [],
      recentPosts:   [],
      olderPosts:    [],
      recentComments:[],
      olderComments: [],
      skipAnalysis:  false,
      cachedResult:  null,
      polarizationScore:       null,
      toxicityTrend:           null,
      toxicityRateRecent:      0,
      toxicityRateOlder:       0,
      participationImbalance:  null,
      uniqueContributors:      0,
      dominantUserShare:       0,
      escalationRate:          null,
      healthScore:             null,
      riskLevel:               null,
      interventionSuggestion:  null,
      result:        null,
    };

    try {
      await this._node_loadSignals(state);
      if (state.skipAnalysis) return state.cachedResult || this._emptyHealth();

      await this._node_computeToxicityTrend(state);
      await this._node_computeParticipationImbalance(state);
      await this._node_computeEscalationRate(state);
      await this._node_computeHealthScore(state);
      await this._node_generateInterventionAndPersist(state);

    } catch (err) {
      console.error('❌ CommunityHealthGraph error:', err.message);
      return this._emptyHealth();
    }

    return state.result || this._emptyHealth();
  }
}

export default new CommunityHealthGraph();