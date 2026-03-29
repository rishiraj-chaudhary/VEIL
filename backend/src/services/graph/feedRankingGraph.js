/**
 * FEED RANKING GRAPH — Step 12
 *
 * 8-node graph that builds a personalised, AI-ranked feed for a user.
 * Signals used:
 *   - Posts/debates the user has written
 *   - Communities the user is active in
 *   - Voting history
 *   - Perception traits (from PerceptionGraph)
 *   - Skill profile (from PerformanceGraph)
 *   - Post intent embeddings vs user interest embedding
 *
 * Place at: backend/src/services/graph/feedRankingGraph.js
 */

import Community from '../../models/community.js';
import Debate from '../../models/Debate.js';
import Post from '../../models/post.js';
import User from '../../models/user.js';
import UserPerformance from '../../models/UserPerformance.js';
import embeddingService from '../embeddingService.js';
import grokService from '../grokService.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const INTENT_TYPES = [
  'argument', 'question', 'discussion', 'evidence',
  'opinion', 'humor', 'news', 'rant', 'call_to_action', 'unknown',
];

// How many candidate posts to fetch before ranking
const CANDIDATE_LIMIT = 60;

// How many posts to return in final ranked feed
const FEED_LIMIT = 20;

// Minimum age before re-classifying intent (24 hours)
const INTENT_RECLASS_MS = 24 * 60 * 60 * 1000;

// ─── Scoring weights ──────────────────────────────────────────────────────────

const WEIGHTS = {
  intentSimilarity:        0.30,
  perceptionCompatibility: 0.20,
  communityAffinity:       0.20,
  engagementWeight:        0.15,
  recency:                 0.15,
};

// ─── Graph ────────────────────────────────────────────────────────────────────

class FeedRankingGraph {

  // ── Node 1: Build user context ────────────────────────────────────────────
  async _node_getUserContext(state) {
    const userId = state.userId;

    // User base
    const user = await User.findById(userId)
      .select('username perceptionTraits perceptionEmbedding skillProfile communities')
      .lean();

    if (!user) throw new Error(`User ${userId} not found`);

    // Communities user belongs to
    const userCommunities = await Community.find({
      $or: [
        { members: userId },
        { creator: userId },
      ],
    }).select('_id name').lean();

    const communityIds = userCommunities.map(c => c._id);

    // User's recent posts (last 30)
    const recentPosts = await Post.find({
      author: userId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('title content intentType intentEmbedding community')
      .lean();

    // User's voted posts (upvoted = strong positive signal)
    const upvotedPosts = await Post.find({
      'voters.user': userId,
      'voters.vote': 1,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('title intentType intentEmbedding community')
      .lean();

    // Debates user participated in
    const recentDebates = await Debate.find({
      'participants.user': userId,
      status: 'completed',
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('topic community')
      .lean();

    // Performance profile (for interest inference)
    const performance = await UserPerformance.findOne({ user: userId })
      .select('skillProfile styleProfile')
      .lean();

    // Build interest text from all user signals for embedding
    const interestSignals = [
      ...recentPosts.map(p => p.title),
      ...upvotedPosts.map(p => p.title),
      ...recentDebates.map(d => d.topic || ''),
    ].filter(Boolean).slice(0, 20);

    state.user             = user;
    state.communityIds     = communityIds;
    state.recentPosts      = recentPosts;
    state.upvotedPosts     = upvotedPosts;
    state.recentDebates    = recentDebates;
    state.performance      = performance;
    state.interestSignals  = interestSignals;

    // Community affinity map: communityId → interaction count
    const affinityMap = {};
    for (const p of recentPosts) {
      const cid = p.community?.toString();
      if (cid) affinityMap[cid] = (affinityMap[cid] || 0) + 2;
    }
    for (const p of upvotedPosts) {
      const cid = p.community?.toString();
      if (cid) affinityMap[cid] = (affinityMap[cid] || 0) + 1;
    }
    for (const d of recentDebates) {
      const cid = d.community?.toString();
      if (cid) affinityMap[cid] = (affinityMap[cid] || 0) + 1;
    }
    state.communityAffinityMap = affinityMap;

    console.log(`🎯 [Feed:1] User context built — ${communityIds.length} communities, ${interestSignals.length} interest signals`);
  }

  // ── Node 2: Retrieve candidate posts ─────────────────────────────────────
  async _node_retrieveCandidatePosts(state) {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

    // Cold start: user has no community memberships — show all recent posts
    const hasCommunities = state.communityIds.length > 0;
    const baseFilter = hasCommunities
      ? {
          isDeleted: false,
          author: { $ne: state.userId },
          $or: [
            { community: { $in: state.communityIds } },
            { karma: { $gte: 5 }, createdAt: { $gte: cutoff } },
          ],
        }
      : {
          isDeleted: false,
          author: { $ne: state.userId },
        };

    const candidates = await Post.find(baseFilter)
      .sort({ createdAt: -1 })
      .limit(CANDIDATE_LIMIT)
      .select('title content author community karma upvotes downvotes commentCount createdAt intentType intentConfidence intentEmbedding intentClassifiedAt')
      .populate('author', 'username')
      .populate('community', 'name displayName')
      .lean();

    state.candidates = candidates;
    console.log(`🎯 [Feed:2] Retrieved ${candidates.length} candidate posts`);
  }

  // ── Node 3: Classify / ensure intent on candidates ───────────────────────
  async _node_computeIntentSimilarity(state) {
    if (state.candidates.length === 0) {
      state.intentScores = {};
      return;
    }

    // Build user interest embedding from signals
    let userInterestEmbedding = null;
    if (state.interestSignals.length > 0) {
      try {
        const interestText = state.interestSignals.join(' | ');
        const embedder = embeddingService.getEmbeddings();
        userInterestEmbedding = await embedder.embedQuery(interestText);
      } catch (err) {
        console.warn('⚠️  [Feed:3] User interest embedding failed:', err.message);
      }
    }

    // For candidates without embeddings, classify intent + embed in batch
    const needsClassification = state.candidates.filter(p =>
      !p.intentType ||
      p.intentType === 'unknown' ||
      !p.intentClassifiedAt ||
      (Date.now() - new Date(p.intentClassifiedAt).getTime()) > INTENT_RECLASS_MS
    );

    if (needsClassification.length > 0) {
      console.log(`🎯 [Feed:3] Classifying intent for ${needsClassification.length} posts...`);
      await this._classifyIntentBatch(needsClassification);
    }

    // Compute cosine similarity between user interest and each post
    const intentScores = {};

    for (const post of state.candidates) {
      const postId = post._id.toString();

      if (userInterestEmbedding && post.intentEmbedding?.length > 0) {
        intentScores[postId] = this._cosineSimilarity(userInterestEmbedding, post.intentEmbedding);
      } else {
        // Fallback: score by intent type preference
        intentScores[postId] = this._intentTypeFallbackScore(post.intentType, state);
      }
    }

    state.intentScores         = intentScores;
    state.userInterestEmbedding = userInterestEmbedding;
    console.log(`🎯 [Feed:3] Intent similarity computed for ${Object.keys(intentScores).length} posts`);
  }

  // ── Node 4: Compute perception compatibility ──────────────────────────────
  async _node_computePerceptionCompatibility(state) {
    const traits   = state.user.perceptionTraits || {};
    const percEmb  = state.user.perceptionEmbedding || [];
    const scores   = {};

    for (const post of state.candidates) {
      const postId = post._id.toString();
      let score = 0.5; // neutral baseline

      // Perception embedding similarity
      if (percEmb.length > 0 && post.intentEmbedding?.length > 0) {
        score = this._cosineSimilarity(percEmb, post.intentEmbedding);
      } else {
        // Trait-based heuristics
        const tone       = traits.tone || 'neutral';
        const style      = traits.argumentativeStyle || 'balanced';
        const intentType = post.intentType || 'unknown';

        // Analytical/evidence-based users prefer argument + evidence posts
        if (['analytical', 'evidence-based'].includes(style)) {
          if (['argument', 'evidence'].includes(intentType)) score += 0.2;
          if (['rant', 'humor'].includes(intentType))         score -= 0.1;
        }

        // Empathetic users prefer discussion + question posts
        if ((traits.empathy || 50) > 65) {
          if (['discussion', 'question'].includes(intentType)) score += 0.15;
        }

        // Aggressive users engage with debate-heavy content
        if ((traits.aggressiveness || 50) > 65) {
          if (['argument', 'rant'].includes(intentType)) score += 0.1;
        }

        // Formal users prefer structured posts
        if ((traits.formality || 50) > 65) {
          if (['argument', 'evidence', 'news'].includes(intentType)) score += 0.1;
          if (['humor', 'rant'].includes(intentType))                 score -= 0.15;
        }

        score = Math.max(0, Math.min(1, score));
      }

      scores[postId] = score;
    }

    state.perceptionScores = scores;
    console.log(`🎯 [Feed:4] Perception compatibility computed`);
  }

  // ── Node 5: Compute community affinity ───────────────────────────────────
  async _node_computeCommunityAffinity(state) {
    const affinityMap = state.communityAffinityMap;
    const maxAffinity = Math.max(1, ...Object.values(affinityMap));
    const scores      = {};

    for (const post of state.candidates) {
      const postId = post._id.toString();
      const cid    = post.community?._id?.toString() || post.community?.toString();
      const raw    = affinityMap[cid] || 0;
      scores[postId] = raw / maxAffinity; // normalise 0–1
    }

    state.communityScores = scores;
    console.log(`🎯 [Feed:5] Community affinity computed`);
  }

  // ── Node 6: Compute engagement weight ────────────────────────────────────
  async _node_computeEngagementWeight(state) {
    const scores = {};

    // Find max karma for normalisation
    const maxKarma = Math.max(1, ...state.candidates.map(p => Math.max(0, p.karma)));

    for (const post of state.candidates) {
      const postId = post._id.toString();

      // Normalised karma (0–1)
      const karmaScore = Math.max(0, post.karma) / maxKarma;

      // Comment velocity bonus
      const ageHours   = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
      const commentRate = (post.commentCount || 0) / Math.max(1, ageHours);
      const commentScore = Math.min(1, commentRate * 5); // cap at 1

      // Recency score (decay over 7 days)
      const ageDays    = ageHours / 24;
      const recency    = Math.max(0, 1 - (ageDays / 7));

      scores[postId] = {
        engagement: (karmaScore * 0.6) + (commentScore * 0.4),
        recency,
      };
    }

    state.engagementScores = scores;
    console.log(`🎯 [Feed:6] Engagement weights computed`);
  }

  // ── Node 7: Rerank with weighted composite score ──────────────────────────
  async _node_rerank(state) {
    const ranked = state.candidates.map(post => {
      const postId = post._id.toString();

      const intentScore      = state.intentScores[postId]      ?? 0.5;
      const perceptionScore  = state.perceptionScores[postId]  ?? 0.5;
      const communityScore   = state.communityScores[postId]   ?? 0;
      const engData          = state.engagementScores[postId]  ?? { engagement: 0, recency: 0.5 };

      const finalScore =
        intentScore      * WEIGHTS.intentSimilarity +
        perceptionScore  * WEIGHTS.perceptionCompatibility +
        communityScore   * WEIGHTS.communityAffinity +
        engData.engagement * WEIGHTS.engagementWeight +
        engData.recency  * WEIGHTS.recency;

      return {
        post,
        scores: {
          intent:      Math.round(intentScore * 100),
          perception:  Math.round(perceptionScore * 100),
          community:   Math.round(communityScore * 100),
          engagement:  Math.round(engData.engagement * 100),
          recency:     Math.round(engData.recency * 100),
          final:       Math.round(finalScore * 100),
        },
      };
    });

    // Sort descending by final score
    ranked.sort((a, b) => b.scores.final - a.scores.final);

    state.rankedPosts = ranked.slice(0, FEED_LIMIT);
    console.log(`🎯 [Feed:7] Reranked — top post score: ${state.rankedPosts[0]?.scores.final ?? 0}`);
  }

  // ── Node 8: Attach "Why am I seeing this?" explanations ──────────────────
  async _node_attachExplanations(state) {
    const result = [];

    for (const { post, scores } of state.rankedPosts) {
      const reasons = [];

      // Community match
      if (scores.community >= 60) {
        const commName = post.community?.displayName || post.community?.name || 'a community you follow';
        reasons.push(`from ${commName}, which you're active in`);
      }

      // Intent match
      if (scores.intent >= 65) {
        reasons.push(`matches topics you've engaged with recently`);
      }

      // Perception match
      if (scores.perception >= 65) {
        reasons.push(`aligns with your debating style`);
      }

      // Engagement
      if (scores.engagement >= 60) {
        reasons.push(`trending in your network`);
      }

      // Recency
      if (scores.recency >= 80) {
        reasons.push(`posted recently`);
      }

      // Intent type label
      const intentLabel = {
        argument:       'debate-worthy argument',
        question:       'open question',
        discussion:     'discussion starter',
        evidence:       'evidence post',
        opinion:        'opinion piece',
        humor:          'humorous post',
        news:           'news update',
        rant:           'passionate take',
        call_to_action: 'community call-to-action',
        unknown:        'post',
      }[post.intentType] || 'post';

      const why = reasons.length > 0
        ? `This ${intentLabel} is shown because it's ${reasons.join(', ')}.`
        : `This ${intentLabel} is popular in your communities.`;

      result.push({
        ...post,
        _rankScores: scores,
        _why: why,
      });
    }

    state.feed = result;
    console.log(`🎯 [Feed:8] Explanations attached — feed ready (${result.length} posts)`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  async _classifyIntentBatch(posts) {
    // Process in batches of 10 to avoid rate limits
    const batchSize = 10;

    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);

      const prompt = `Classify the intent of each post. Return ONLY valid JSON array with no preamble.

Posts:
${batch.map((p, idx) => `${idx + 1}. "${p.title}"`).join('\n')}

Return:
[
  { "index": 1, "intentType": "<type>", "confidence": 0.0-1.0 }
]

Intent types: ${INTENT_TYPES.join(', ')}
Rules: one type per post, confidence 0.0-1.0, JSON only`;

      try {
        const raw = await grokService.generateFast(prompt, {
          systemRole: 'You are a content classifier. Return only valid JSON array.',
        });

        const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const results = JSON.parse(clean);

        // Apply results and generate embeddings
        for (const r of results) {
          const post = batch[r.index - 1];
          if (!post) continue;

          const intentType       = INTENT_TYPES.includes(r.intentType) ? r.intentType : 'unknown';
          const intentConfidence = typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.5;

          // Generate embedding for this post
          let intentEmbedding = [];
          try {
            const embedder = embeddingService.getEmbeddings();
            const text     = `${post.title} ${(post.content || '').slice(0, 200)}`.trim();
            intentEmbedding = await embedder.embedQuery(text);
          } catch (_) { /* embedding optional */ }

          // Persist back to DB (non-blocking per post)
          Post.findByIdAndUpdate(post._id, {
            intentType,
            intentConfidence,
            intentEmbedding,
            intentClassifiedAt: new Date(),
          }).catch(err => console.warn('Intent persist error:', err.message));

          // Update in-memory too so this run uses it
          post.intentType        = intentType;
          post.intentConfidence  = intentConfidence;
          post.intentEmbedding   = intentEmbedding;
        }

      } catch (err) {
        console.warn(`⚠️  [Feed:3] Intent batch classification failed:`, err.message);
        // Mark posts as 'unknown' so they're not re-attempted this run
        for (const post of batch) {
          post.intentType = 'unknown';
        }
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < posts.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  _cosineSimilarity(a, b) {
    if (!a?.length || !b?.length || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot   += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  _intentTypeFallbackScore(intentType, state) {
    // Heuristic: score by how much this intent type matches user's known style
    const style = state.user.perceptionTraits?.argumentativeStyle || 'balanced';
    const map = {
      'evidence-based': { argument: 0.9, evidence: 0.85, discussion: 0.7, question: 0.6, opinion: 0.5, news: 0.6, humor: 0.3, rant: 0.2, call_to_action: 0.4, unknown: 0.4 },
      'logical':        { argument: 0.9, evidence: 0.8,  discussion: 0.7, question: 0.65, opinion: 0.4, news: 0.5, humor: 0.3, rant: 0.2, call_to_action: 0.35, unknown: 0.4 },
      'rhetorical':     { argument: 0.7, evidence: 0.5,  discussion: 0.8, question: 0.7, opinion: 0.75, news: 0.5, humor: 0.6, rant: 0.5, call_to_action: 0.6, unknown: 0.5 },
      'balanced':       { argument: 0.7, evidence: 0.65, discussion: 0.75, question: 0.7, opinion: 0.6, news: 0.6, humor: 0.5, rant: 0.4, call_to_action: 0.5, unknown: 0.5 },
    };
    return (map[style] || map['balanced'])[intentType] || 0.5;
  }

  // ─── Public run method ─────────────────────────────────────────────────────
  /**
   * @param {string|ObjectId} userId
   * @param {Object} options
   * @param {number} options.limit   — max posts to return (default 20)
   * @param {number} options.page    — pagination page (default 1)
   */
  async run(userId, options = {}) {
    const { limit = FEED_LIMIT, page = 1 } = options;

    const state = {
      userId:               userId.toString(),
      limit,
      page,
      user:                 null,
      communityIds:         [],
      communityAffinityMap: {},
      interestSignals:      [],
      candidates:           [],
      intentScores:         {},
      perceptionScores:     {},
      communityScores:      {},
      engagementScores:     {},
      rankedPosts:          [],
      feed:                 [],
    };

    try {
      await this._node_getUserContext(state);
      await this._node_retrieveCandidatePosts(state);

      if (state.candidates.length === 0) {
        console.log('🎯 [Feed] No candidates found');
        return { feed: [], total: 0, page, userId };
      }

      await this._node_computeIntentSimilarity(state);
      await this._node_computePerceptionCompatibility(state);
      await this._node_computeCommunityAffinity(state);
      await this._node_computeEngagementWeight(state);
      await this._node_rerank(state);
      await this._node_attachExplanations(state);

    } catch (err) {
      console.error('❌ FeedRankingGraph error:', err.message);
      // Fallback: return unranked candidates
      state.feed = state.candidates.slice(0, limit).map(p => ({
        ...p,
        _rankScores: null,
        _why: 'Shown from your communities.',
      }));
    }

    return {
      feed:   state.feed,
      total:  state.feed.length,
      page,
      userId: state.userId,
    };
  }
}

export default new FeedRankingGraph();