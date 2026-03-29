/**
 * COMMUNITY MEMORY GRAPH — Step 15
 *
 * Builds a living intelligence layer on top of a community's activity.
 * Runs on-demand with a cache threshold (re-analyses after 20 new posts).
 *
 * Produces:
 *   - topicClusters        — real recurring themes from posts/comments
 *   - recurringClaims      — arguments that keep coming back
 *   - toneProfile          — civil/aggressive, technical/emotional, etc.
 *   - polarizationScore    — 0–100 (echo chamber vs battleground)
 *   - onboardingSummary    — AI paragraph for new members
 *
 * Nodes:
 *   1. loadCommunityData
 *   2. clusterTopics
 *   3. detectRecurringArguments
 *   4. computeToneAndPolarization
 *   5. generateOnboardingSummary
 *   6. persist
 *
 * Place at: backend/src/services/graph/communityMemoryGraph.js
 */

import Comment from '../../models/comment.js';
import Community from '../../models/community.js';
import Post from '../../models/post.js';
import grokService from '../grokService.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_POSTS          = 1;    // minimum posts to run analysis
const REANALYSE_THRESHOLD = 20;  // re-analyse after this many new posts
const MAX_POSTS_FOR_LLM  = 30;   // cap sent to LLM (cost control)
const MAX_COMMENTS_FOR_LLM = 50;

// ─── Graph ────────────────────────────────────────────────────────────────────

class CommunityMemoryGraph {

  // ── Node 1: Load community data ──────────────────────────────────────────────
  async _node_loadCommunityData(state) {
    const { communityId, options } = state;

    const community = await Community.findById(communityId)
      .select('name displayName description memberCount postCount memoryAnalysis')
      .lean();

    if (!community) throw new Error(`Community ${communityId} not found`);

    // Check cache — only use if previous analysis actually produced results
    const existing = community.memoryAnalysis;
    if (!options.force && existing?.analysedAt && existing?.onboardingSummary) {
      const postsSince = community.postCount - (existing.postCountAtAnalysis || 0);
      if (postsSince < REANALYSE_THRESHOLD) {
        state.skipAnalysis = true;
        state.cachedResult = existing;
        console.log(`🏘️ [Community:1] Using cached analysis (${postsSince} new posts, threshold ${REANALYSE_THRESHOLD})`);
        return;
      }
    }

    // Load recent posts
    const posts = await Post.find({ community: communityId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(MAX_POSTS_FOR_LLM)
      .populate('author', 'username')
      .lean();

    if (posts.length < MIN_POSTS) {
      state.skipAnalysis = true;
      state.cachedResult = this._emptyAnalysis(community);
      console.log(`🏘️ [Community:1] Too few posts (${posts.length}), skipping`);
      return;
    }

    // Load recent comments
    const postIds = posts.map(p => p._id);
    const comments = await Comment.find({
      post: { $in: postIds },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(MAX_COMMENTS_FOR_LLM)
      .populate('author', 'username')
      .lean();

    state.community    = community;
    state.posts        = posts;
    state.comments     = comments;
    state.skipAnalysis = false;

    console.log(`🏘️ [Community:1] Loaded ${posts.length} posts, ${comments.length} comments for c/${community.name}`);
  }

  // ── Node 2: Cluster topics ────────────────────────────────────────────────────
  async _node_clusterTopics(state) {
    if (state.skipAnalysis) return;

    const postSummaries = state.posts
      .map((p, i) => `[${i + 1}] "${p.title}" ${p.content ? '— ' + p.content.slice(0, 100) : ''}`)
      .join('\n');

    const prompt = `Analyse these posts from community "${state.community.displayName}" and identify the main topic clusters.

COMMUNITY DESCRIPTION: "${state.community.description || 'none'}"

RECENT POSTS:
${postSummaries}

Identify 3–5 distinct topic clusters that this community actually discusses (based on posts, not the description).

Return ONLY valid JSON, no preamble:
{
  "clusters": [
    {
      "name": "short topic name",
      "description": "one sentence",
      "frequency": "high|medium|low",
      "examplePost": "brief example from the list above"
    }
  ]
}`;

    try {
      const raw   = await grokService.generateFast(prompt, { systemRole: 'You are a community analyst. Return only valid JSON.' });
      const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(clean);
      state.topicClusters = Array.isArray(parsed.clusters) ? parsed.clusters.slice(0, 5) : [];
    } catch (err) {
      console.warn('⚠️ [Community:2] Topic clustering failed:', err.message);
      state.topicClusters = [];
    }

    console.log(`🏘️ [Community:2] Topic clusters: ${state.topicClusters.map(c => c.name).join(', ')}`);
  }

  // ── Node 3: Detect recurring arguments ───────────────────────────────────────
  async _node_detectRecurringArguments(state) {
    if (state.skipAnalysis) return;

    const allText = [
      ...state.posts.map(p => p.title + (p.content ? ' ' + p.content.slice(0, 150) : '')),
      ...state.comments.map(c => c.content.slice(0, 150)),
    ].join('\n');

    const prompt = `Identify recurring arguments or debates that keep appearing in this community.

COMMUNITY: "${state.community.displayName}"
CONTENT SAMPLE:
${allText.slice(0, 3000)}

Find 2–4 arguments or positions that appear repeatedly across different posts/comments.

Return ONLY valid JSON, no preamble:
{
  "recurringClaims": [
    {
      "claim": "short statement of the recurring argument",
      "frequency": "how often it appears",
      "sides": ["position A", "position B"],
      "resolved": false
    }
  ]
}`;

    try {
      const raw    = await grokService.generateFast(prompt, { systemRole: 'You are a discourse analyst. Return only valid JSON.' });
      const clean  = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(clean);
      state.recurringClaims = Array.isArray(parsed.recurringClaims) ? parsed.recurringClaims.slice(0, 4) : [];
    } catch (err) {
      console.warn('⚠️ [Community:3] Recurring arguments failed:', err.message);
      state.recurringClaims = [];
    }

    console.log(`🏘️ [Community:3] Recurring claims: ${state.recurringClaims.length}`);
  }

  // ── Node 4: Compute tone and polarization ─────────────────────────────────────
  async _node_computeToneAndPolarization(state) {
    if (state.skipAnalysis) return;

    // Heuristic tone signals from comments
    const allCommentText = state.comments.map(c => c.content).join(' ');
    const wordCount      = allCommentText.split(/\s+/).length || 1;

    const aggressiveWords = (allCommentText.match(/\b(wrong|stupid|idiot|disagree|false|incorrect|lie|nonsense|ridiculous)\b/gi) || []).length;
    const technicalWords  = (allCommentText.match(/\b(data|research|study|evidence|according|shows|percent|statistic|source)\b/gi) || []).length;
    const emotionalWords  = (allCommentText.match(/\b(feel|believe|think|hope|love|hate|scared|worried|angry|frustrated)\b/gi) || []).length;

    const aggressionRatio  = aggressiveWords / wordCount;
    const technicalRatio   = technicalWords  / wordCount;
    const emotionalRatio   = emotionalWords  / wordCount;

    // LLM tone classification
    const sampleComments = state.comments.slice(0, 20).map(c => c.content.slice(0, 150)).join('\n');

    const prompt = `Classify the tone of this community based on these recent comments.

COMMUNITY: "${state.community.displayName}"
COMMENTS SAMPLE:
${sampleComments}

Return ONLY valid JSON, no preamble:
{
  "toneProfile": {
    "civility": "civil|mixed|aggressive",
    "style": "technical|balanced|emotional",
    "depth": "surface|moderate|deep",
    "openness": "open|echo_chamber|polarized",
    "summary": "one sentence describing the community tone"
  },
  "polarizationScore": 0-100
}

polarizationScore: 0=complete echo chamber, 50=healthy debate, 100=extreme polarization/battleground`;

    try {
      const raw    = await grokService.generateFast(prompt, { systemRole: 'You are a community analyst. Return only valid JSON.' });
      const clean  = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(clean);

      state.toneProfile       = parsed.toneProfile || { civility: 'mixed', style: 'balanced', depth: 'moderate', openness: 'open', summary: 'Mixed discussion style.' };
      state.polarizationScore = typeof parsed.polarizationScore === 'number'
        ? Math.max(0, Math.min(100, parsed.polarizationScore))
        : 50;

    } catch (err) {
      console.warn('⚠️ [Community:4] Tone analysis failed:', err.message);
      state.toneProfile = {
        civility:  aggressionRatio > 0.02 ? 'aggressive' : 'civil',
        style:     technicalRatio > emotionalRatio ? 'technical' : 'emotional',
        depth:     'moderate',
        openness:  'open',
        summary:   'Tone analysis unavailable.',
      };
      state.polarizationScore = 50;
    }

    console.log(`🏘️ [Community:4] Tone: ${state.toneProfile.civility} / ${state.toneProfile.style}, polarization: ${state.polarizationScore}`);
  }

  // ── Node 5: Generate onboarding summary ──────────────────────────────────────
  async _node_generateOnboardingSummary(state) {
    if (state.skipAnalysis) return;

    const topicsText   = state.topicClusters.map(c => c.name).join(', ') || 'various topics';
    const claimsText   = state.recurringClaims.map(c => c.claim).join('; ') || 'none identified';
    const toneText     = `${state.toneProfile.civility}, ${state.toneProfile.style}`;

    const prompt = `Write a welcoming onboarding summary for a new member joining this community.

COMMUNITY: "${state.community.displayName}"
ORIGINAL DESCRIPTION: "${state.community.description || 'none'}"
ACTUAL TOPICS DISCUSSED: ${topicsText}
RECURRING DEBATES: ${claimsText}
TONE: ${toneText}
POLARIZATION: ${state.polarizationScore}/100
MEMBERS: ${state.community.memberCount}

Write 2–3 sentences that honestly describe what this community is actually like based on the data above.
Be specific, accurate, and welcoming. Do not just restate the description.
Do not use bullet points. Return plain text only.`;

    try {
      const summary = await grokService.generateFast(prompt, {
        systemRole: 'You are a community guide. Write a welcoming, honest, specific onboarding summary.',
      });
      state.onboardingSummary = summary.trim().slice(0, 600);
    } catch (err) {
      console.warn('⚠️ [Community:5] Onboarding summary failed:', err.message);
      state.onboardingSummary = `${state.community.displayName} is a community focused on ${topicsText}. Tone is generally ${toneText}.`;
    }

    console.log(`🏘️ [Community:5] Onboarding summary generated (${state.onboardingSummary.length} chars)`);
  }

  // ── Node 6: Persist to Community ─────────────────────────────────────────────
  async _node_persist(state) {
    if (state.skipAnalysis) return;

    const analysis = {
      topicClusters:        state.topicClusters,
      recurringClaims:      state.recurringClaims,
      toneProfile:          state.toneProfile,
      polarizationScore:    state.polarizationScore,
      onboardingSummary:    state.onboardingSummary,
      postCountAtAnalysis:  state.posts.length,
      analysedAt:           new Date(),
    };

    await Community.findByIdAndUpdate(state.communityId, {
      memoryAnalysis: analysis,
    });

    state.result = analysis;
    console.log(`🏘️ [Community:6] Persisted to Community ${state.communityId}`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  _emptyAnalysis(community) {
    return {
      topicClusters:        [],
      recurringClaims:      [],
      toneProfile:          null,
      polarizationScore:    null,
      onboardingSummary:    null,
      postCountAtAnalysis:  0,
      analysedAt:           new Date(),
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
      communityId:      communityId.toString(),
      options,
      community:        null,
      posts:            [],
      comments:         [],
      skipAnalysis:     false,
      cachedResult:     null,
      topicClusters:    [],
      recurringClaims:  [],
      toneProfile:      null,
      polarizationScore:null,
      onboardingSummary:null,
      result:           null,
    };

    try {
      await this._node_loadCommunityData(state);
      if (state.skipAnalysis) return state.cachedResult || this._emptyAnalysis(state.community || {});

      await this._node_clusterTopics(state);
      await this._node_detectRecurringArguments(state);
      await this._node_computeToneAndPolarization(state);
      await this._node_generateOnboardingSummary(state);
      await this._node_persist(state);

    } catch (err) {
      console.error('❌ CommunityMemoryGraph error:', err.message);
      return this._emptyAnalysis({});
    }

    return state.result || this._emptyAnalysis({});
  }
}

export default new CommunityMemoryGraph();