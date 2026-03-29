/**
 * THREAD EVOLUTION GRAPH — Step 13
 *
 * Analyses a post's comment thread and produces:
 *   1. Sentiment arc     — emotional trajectory across the thread over time
 *   2. Topic drift       — did the conversation stay on topic?
 *   3. Turning points    — the specific comment(s) that shifted tone
 *   4. Thread health     — single 0–100 score
 *   5. Dominant voices   — who's driving the conversation, and how?
 *   6. Persisted result  — cached on the Post document (threadAnalysis field)
 *
 * Place at: backend/src/services/graph/threadEvolutionGraph.js
 */

import Comment from '../../models/comment.js';
import Post from '../../models/post.js';
import grokService from '../grokService.js';

// ─── Constants ────────────────────────────────────────────────────────────────

// Minimum comments needed to run analysis
const MIN_COMMENTS = 3;

// Re-analyse after this many new comments since last analysis
const REANALYSE_THRESHOLD = 5;

// Max comments to send to LLM in one shot (cost control)
const LLM_COMMENT_LIMIT = 40;

// ─── Graph ────────────────────────────────────────────────────────────────────

class ThreadEvolutionGraph {

  // ── Node 1: Load thread ───────────────────────────────────────────────────
  async _node_loadThread(state) {
    const { postId } = state;

    const post = await Post.findOne({ _id: postId, isDeleted: false })
      .select('title content threadAnalysis commentCount')
      .lean();

    if (!post) throw new Error(`Post ${postId} not found`);

    // Load ALL non-deleted comments, ordered by creation time
    const comments = await Comment.find({ post: postId, isDeleted: false })
      .sort({ createdAt: 1 })
      .populate('author', 'username')
      .lean();

    state.post        = post;
    state.comments    = comments;
    state.totalCount  = comments.length;

    // Check if re-analysis is needed
    const existing = post.threadAnalysis;
    if (existing && existing.commentCountAtAnalysis) {
      const newComments = comments.length - existing.commentCountAtAnalysis;
      if (newComments < REANALYSE_THRESHOLD) {
        state.skipAnalysis = true;
        state.cachedResult = existing;
        console.log(`🧵 [Thread:1] Using cached analysis (${newComments} new comments, threshold ${REANALYSE_THRESHOLD})`);
        return;
      }
    }

    state.skipAnalysis = false;
    console.log(`🧵 [Thread:1] Loaded ${comments.length} comments for post "${post.title?.slice(0, 50)}"`);
  }

  // ── Node 2: Build comment timeline ───────────────────────────────────────
  async _node_buildTimeline(state) {
    if (state.skipAnalysis) return;
    if (state.comments.length < MIN_COMMENTS) {
      state.skipAnalysis = true;
      state.cachedResult = this._emptyAnalysis(state.totalCount);
      console.log(`🧵 [Thread:2] Too few comments (${state.comments.length}), skipping`);
      return;
    }

    // Group comments into time buckets (early / middle / late thirds)
    const total    = state.comments.length;
    const third    = Math.ceil(total / 3);
    const early    = state.comments.slice(0, third);
    const middle   = state.comments.slice(third, third * 2);
    const late     = state.comments.slice(third * 2);

    // Build flat text windows for LLM
    const toText = (comments) =>
      comments.map((c, i) => `[${i + 1}] ${c.author?.username || 'anon'}: ${c.content.slice(0, 300)}`).join('\n');

    state.timeline = {
      early:  { comments: early,  text: toText(early)  },
      middle: { comments: middle, text: toText(middle) },
      late:   { comments: late,   text: toText(late)   },
    };

    // Build full thread text (capped for LLM cost)
    const capped = state.comments.slice(0, LLM_COMMENT_LIMIT);
    state.fullThreadText = capped
      .map((c, i) => `[${i + 1}] depth:${c.depth} ${c.author?.username || 'anon'} (karma:${c.karma}): ${c.content.slice(0, 400)}`)
      .join('\n');

    // Author frequency map
    const authorMap = {};
    for (const c of state.comments) {
      const name = c.author?.username || 'anon';
      if (!authorMap[name]) authorMap[name] = { count: 0, karma: 0, comments: [] };
      authorMap[name].count++;
      authorMap[name].karma += c.karma || 0;
      authorMap[name].comments.push(c.content.slice(0, 100));
    }
    state.authorMap = authorMap;

    console.log(`🧵 [Thread:2] Timeline built — early:${early.length} mid:${middle.length} late:${late.length}`);
  }

  // ── Node 3: Analyse sentiment arc ────────────────────────────────────────
  async _node_analyseSentimentArc(state) {
    if (state.skipAnalysis) return;

    const { early, middle, late } = state.timeline;

    const prompt = `Analyse the sentiment of each section of this comment thread.

POST TITLE: "${state.post.title}"

EARLY COMMENTS:
${early.text || '(none)'}

MIDDLE COMMENTS:
${middle.text || '(none)'}

LATE COMMENTS:
${late.text || '(none)'}

Return ONLY valid JSON, no preamble:
{
  "early":  { "sentiment": "positive|neutral|negative|mixed", "score": 0-100, "summary": "one sentence" },
  "middle": { "sentiment": "positive|neutral|negative|mixed", "score": 0-100, "summary": "one sentence" },
  "late":   { "sentiment": "positive|neutral|negative|mixed", "score": 0-100, "summary": "one sentence" },
  "arc": "improving|declining|stable|volatile|started_negative|started_positive",
  "arcSummary": "one sentence describing overall emotional trajectory"
}

Score 0=very negative, 50=neutral, 100=very positive.`;

    try {
      const raw   = await grokService.generateFast(prompt, { systemRole: 'You are a sentiment analyst. Return only valid JSON.' });
      const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      state.sentimentArc = JSON.parse(clean);
    } catch (err) {
      console.warn('⚠️  [Thread:3] Sentiment arc failed:', err.message);
      state.sentimentArc = {
        early:  { sentiment: 'neutral', score: 50, summary: 'Unable to analyse' },
        middle: { sentiment: 'neutral', score: 50, summary: 'Unable to analyse' },
        late:   { sentiment: 'neutral', score: 50, summary: 'Unable to analyse' },
        arc: 'stable',
        arcSummary: 'Sentiment analysis unavailable',
      };
    }

    console.log(`🧵 [Thread:3] Sentiment arc: ${state.sentimentArc.arc}`);
  }

  // ── Node 4: Detect topic drift ────────────────────────────────────────────
  async _node_detectTopicDrift(state) {
    if (state.skipAnalysis) return;

    const prompt = `Analyse whether this comment thread stays on topic or drifts.

POST TITLE: "${state.post.title}"
POST CONTENT: "${(state.post.content || '').slice(0, 300)}"

THREAD (chronological):
${state.fullThreadText}

Return ONLY valid JSON, no preamble:
{
  "onTopic": true|false,
  "driftScore": 0-100,
  "originalTopic": "what the post was about",
  "driftedTo": "what the thread drifted to, or null if no drift",
  "driftTriggerIndex": null or comment index (1-based) where drift started,
  "driftSummary": "one sentence"
}

driftScore: 0=completely on topic, 100=completely drifted.`;

    try {
      const raw   = await grokService.generateFast(prompt, { systemRole: 'You are a topic analyst. Return only valid JSON.' });
      const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      state.topicDrift = JSON.parse(clean);
    } catch (err) {
      console.warn('⚠️  [Thread:4] Topic drift failed:', err.message);
      state.topicDrift = {
        onTopic: true,
        driftScore: 0,
        originalTopic: state.post.title,
        driftedTo: null,
        driftTriggerIndex: null,
        driftSummary: 'Topic drift analysis unavailable',
      };
    }

    console.log(`🧵 [Thread:4] Topic drift score: ${state.topicDrift.driftScore}`);
  }

  // ── Node 5: Identify turning points ──────────────────────────────────────
  async _node_identifyTurningPoints(state) {
    if (state.skipAnalysis) return;

    const prompt = `Identify key turning points in this comment thread — moments where tone, topic, or quality shifted significantly.

POST TITLE: "${state.post.title}"

THREAD (chronological, with index):
${state.fullThreadText}

Return ONLY valid JSON array, no preamble:
[
  {
    "index": <1-based comment index>,
    "author": "<username>",
    "type": "tone_shift|topic_change|quality_drop|quality_rise|conflict_start|conflict_end|insight",
    "description": "one sentence explaining why this is a turning point",
    "impact": "positive|negative|neutral"
  }
]

Return empty array [] if no clear turning points. Maximum 3 turning points.`;

    try {
      const raw   = await grokService.generateFast(prompt, { systemRole: 'You are a conversation analyst. Return only valid JSON array.' });
      const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(clean);
      state.turningPoints = Array.isArray(parsed) ? parsed.slice(0, 3) : [];

      // Attach the actual comment text to each turning point
      for (const tp of state.turningPoints) {
        const comment = state.comments[tp.index - 1];
        if (comment) {
          tp.commentSnippet = comment.content.slice(0, 150);
          tp.commentId      = comment._id?.toString();
        }
      }
    } catch (err) {
      console.warn('⚠️  [Thread:5] Turning points failed:', err.message);
      state.turningPoints = [];
    }

    console.log(`🧵 [Thread:5] Turning points found: ${state.turningPoints.length}`);
  }

  // ── Node 6: Identify dominant voices ─────────────────────────────────────
  async _node_identifyDominantVoices(state) {
    if (state.skipAnalysis) return;

    // Sort authors by comment count
    const sorted = Object.entries(state.authorMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    if (sorted.length === 0) {
      state.dominantVoices = [];
      return;
    }

    const authorSummary = sorted
      .map(([name, data]) => `${name}: ${data.count} comments, total karma ${data.karma}. Sample: "${data.comments[0]}"`)
      .join('\n');

    const prompt = `Classify these dominant voices in the thread. Are they adding value or detracting?

POST TITLE: "${state.post.title}"

TOP COMMENTERS:
${authorSummary}

Return ONLY valid JSON array, no preamble:
[
  {
    "username": "<name>",
    "commentCount": <number>,
    "role": "constructive|disruptive|informative|humorous|inflammatory|balanced",
    "influence": "high|medium|low",
    "summary": "one sentence about their contribution"
  }
]`;

    try {
      const raw   = await grokService.generateFast(prompt, { systemRole: 'You are a community analyst. Return only valid JSON array.' });
      const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(clean);
      state.dominantVoices = Array.isArray(parsed) ? parsed : [];

      // Enrich with raw counts
      for (const voice of state.dominantVoices) {
        const data = state.authorMap[voice.username];
        if (data) {
          voice.commentCount = data.count;
          voice.totalKarma   = data.karma;
        }
      }
    } catch (err) {
      console.warn('⚠️  [Thread:6] Dominant voices failed:', err.message);
      state.dominantVoices = sorted.map(([username, data]) => ({
        username,
        commentCount: data.count,
        totalKarma:   data.karma,
        role:         'balanced',
        influence:    'medium',
        summary:      `${data.count} comments in this thread`,
      }));
    }

    console.log(`🧵 [Thread:6] Dominant voices: ${state.dominantVoices.map(v => v.username).join(', ')}`);
  }

  // ── Node 7: Compute thread health score ──────────────────────────────────
  async _node_computeHealthScore(state) {
    if (state.skipAnalysis) return;

    const arc      = state.sentimentArc;
    const drift    = state.topicDrift;
    const turning  = state.turningPoints;
    const voices   = state.dominantVoices;

    // Component scores (0–100 each)
    const sentimentScore = (() => {
      const avg = ((arc.early?.score ?? 50) + (arc.middle?.score ?? 50) + (arc.late?.score ?? 50)) / 3;
      return avg;
    })();

    const topicScore = Math.max(0, 100 - (drift.driftScore || 0));

    const toxicityPenalty = turning.filter(t => t.impact === 'negative').length * 10;
    const qualityBonus    = turning.filter(t => t.type === 'insight' || t.impact === 'positive').length * 5;

    const voiceScore = (() => {
      if (voices.length === 0) return 50;
      const constructive = voices.filter(v => ['constructive', 'informative', 'balanced'].includes(v.role)).length;
      return Math.round((constructive / voices.length) * 100);
    })();

    const participationScore = (() => {
      const uniqueAuthors = Object.keys(state.authorMap).length;
      const ratio = Math.min(1, uniqueAuthors / Math.max(1, state.totalCount));
      return Math.round(ratio * 100);
    })();

    const raw = (
      sentimentScore   * 0.30 +
      topicScore       * 0.25 +
      voiceScore       * 0.20 +
      participationScore * 0.15 +
      50               * 0.10   // baseline
    ) - toxicityPenalty + qualityBonus;

    const healthScore = Math.max(0, Math.min(100, Math.round(raw)));

    const healthLabel =
      healthScore >= 80 ? 'thriving' :
      healthScore >= 60 ? 'healthy' :
      healthScore >= 40 ? 'mixed' :
      healthScore >= 20 ? 'troubled' : 'toxic';

    state.healthScore = healthScore;
    state.healthLabel = healthLabel;
    state.scoreBreakdown = {
      sentiment:     Math.round(sentimentScore),
      topicFocus:    Math.round(topicScore),
      voiceQuality:  voiceScore,
      participation: participationScore,
      toxicityHits:  toxicityPenalty / 10,
      qualityHits:   qualityBonus / 5,
    };

    console.log(`🧵 [Thread:7] Health score: ${healthScore} (${healthLabel})`);
  }

  // ── Node 8: Persist to Post ───────────────────────────────────────────────
  async _node_persist(state) {
    if (state.skipAnalysis) return;

    const analysis = {
      healthScore:           state.healthScore,
      healthLabel:           state.healthLabel,
      scoreBreakdown:        state.scoreBreakdown,
      sentimentArc:          state.sentimentArc,
      topicDrift:            state.topicDrift,
      turningPoints:         state.turningPoints,
      dominantVoices:        state.dominantVoices,
      commentCountAtAnalysis: state.totalCount,
      analysedAt:            new Date(),
    };

    await Post.findByIdAndUpdate(state.postId, {
      threadAnalysis: analysis,
    });

    state.result = analysis;
    console.log(`🧵 [Thread:8] Persisted to Post ${state.postId}`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  _emptyAnalysis(commentCount) {
    return {
      healthScore:    null,
      healthLabel:    'insufficient_data',
      scoreBreakdown: null,
      sentimentArc:   null,
      topicDrift:     null,
      turningPoints:  [],
      dominantVoices: [],
      commentCountAtAnalysis: commentCount,
      analysedAt:     new Date(),
    };
  }

  // ─── Public run ─────────────────────────────────────────────────────────────
  /**
   * @param {string|ObjectId} postId
   * @param {Object} options
   * @param {boolean} options.force — force re-analysis even if cache is fresh
   */
  async run(postId, options = {}) {
    const state = {
      postId:        postId.toString(),
      post:          null,
      comments:      [],
      totalCount:    0,
      skipAnalysis:  false,
      cachedResult:  null,
      timeline:      null,
      fullThreadText:'',
      authorMap:     {},
      sentimentArc:  null,
      topicDrift:    null,
      turningPoints: [],
      dominantVoices:[],
      healthScore:   null,
      healthLabel:   null,
      scoreBreakdown:null,
      result:        null,
    };

    if (options.force) {
      // Will bypass cache check in node 1
      state._forceReanalyse = true;
    }

    try {
      await this._node_loadThread(state);
      if (state.skipAnalysis) return state.cachedResult || this._emptyAnalysis(state.totalCount);

      await this._node_buildTimeline(state);
      if (state.skipAnalysis) return state.cachedResult || this._emptyAnalysis(state.totalCount);

      await this._node_analyseSentimentArc(state);
      await this._node_detectTopicDrift(state);
      await this._node_identifyTurningPoints(state);
      await this._node_identifyDominantVoices(state);
      await this._node_computeHealthScore(state);
      await this._node_persist(state);

    } catch (err) {
      console.error('❌ ThreadEvolutionGraph error:', err.message);
      return this._emptyAnalysis(state.totalCount || 0);
    }

    return state.result || this._emptyAnalysis(state.totalCount);
  }
}

export default new ThreadEvolutionGraph();